import { awaitExport } from '../lib/export-state.mjs';
import { initial, validate, csvRows, types } from './model.mjs';
import { chartFormats } from './capabilities.mjs';
import { renderChartSvg } from './render.mjs';
function mount(root) {
  const el = (s) => root.querySelector(s),
    all = (s) => [...root.querySelectorAll(s)];
  const newEl = (tag, t) => {
    const e = document.createElement(tag);
    if (t !== undefined) e.textContent = t;
    return e;
  };
  let chart,
    record,
    valid,
    busy = false,
    tab = 'data',
    formats = null;
  let templateId = root.dataset.template || null,
    original = root.dataset.topic;
  const key = (t) =>
    'templateatlas.chart.v2.' +
    t +
    '.' +
    (t === original && templateId ? templateId : 'standalone');
  function open(t) {
    chart = initial(t);
    record = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key(t)));
      if (saved && saved.chart.type === t && Array.isArray(saved.chart.rows)) {
        chart = saved.chart;
        record = saved.record ?? null;
      }
    } catch {}
  }
  function save() {
    try {
      sessionStorage.setItem(
        key(chart.type),
        JSON.stringify({ chart, record }),
      );
      el('[data-status]').textContent = 'Draft saved in this tab';
    } catch {
      el('[data-status]').textContent = 'Draft could not be saved in this tab';
    }
  }
  const setError = (s) => (el('[data-error]').textContent = s);
  function refresh() {
    el('[data-rev]').textContent = 'Revision ' + chart.revision;
    el('[data-schema]').textContent = types[chart.type].method;
    el('[data-method]').textContent = types[chart.type].method;
    el('[data-sample]').hidden = !chart.sample;
    try {
      valid = validate(chart);
      el('[data-graph]').innerHTML = renderChartSvg(valid);
      setError('');
    } catch (e) {
      valid = null;
      el('[data-graph]').replaceChildren(
        newEl('p', 'Update the data to see your chart.'),
      );
      setError(e.message);
    }
    const table = el('[data-values]');
    table.replaceChildren();
    const thead = table.createTHead(),
      head = thead.insertRow();
    chart.headers.forEach((a) => head.append(newEl('th', a)));
    const body = table.createTBody();
    for (const row of valid?.rows ?? chart.rows) {
      const tr = body.insertRow();
      for (const value of row)
        tr.insertCell().textContent =
          value === null || value === '' ? 'Missing' : String(value);
    }
    el('[data-summary]').textContent = valid
      ? valid.title +
        ' • ' +
        valid.rows.length +
        ' data rows • Revision ' +
        valid.revision
      : 'Correct the data before exporting.';
    el('[data-export]').disabled = busy || !valid;
    el('[data-save-doc]').disabled = busy || !valid;
  }
  function changed(isData) {
    chart.revision++;
    if (isData) chart.sample = false;
    save();
    refresh();
  }
  function grid() {
    const t = el('[data-grid]');
    t.replaceChildren();
    const hr = t.createTHead().insertRow();
    chart.headers.forEach((s, j) => {
      const th = newEl('th'),
        input = newEl('input');
      input.value = s;
      input.maxLength = 48;
      input.setAttribute('aria-label', 'Heading for column ' + (j + 1));
      input.oninput = () => {
        chart.headers[j] = input.value;
        changed(true);
      };
      th.append(input, newEl('small', types[chart.type].kinds[j]));
      hr.append(th);
    });
    hr.append(newEl('th', 'Row'));
    const tbody = t.createTBody();
    chart.rows.forEach((row, i) => {
      const tr = tbody.insertRow();
      row.forEach((v, j) => {
        const td = tr.insertCell(),
          input = newEl('input');
        input.value = v ?? '';
        input.setAttribute('aria-label', chart.headers[j] + ', row ' + (i + 1));
        input.maxLength = 100;
        input.oninput = () => {
          row[j] = input.value;
          changed(true);
        };
        td.append(input);
      });
      const btn = newEl('button', 'Remove');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Remove row ' + (i + 1));
      btn.onclick = () => {
        chart.rows.splice(i, 1);
        grid();
        changed(true);
      };
      tr.insertCell().append(btn);
    });
  }
  function sync() {
    const format = el('[data-format]');
    format.replaceChildren();
    for (const v of formats?.[chart.type] ?? chartFormats(chart.type)) {
      const opt = newEl(
        'option',
        {
          svg: 'SVG vector graphic',
          xlsx: 'Editable Excel chart (.xlsx)',
          pdf: 'PDF · US Letter',
          jpg: 'JPEG image',
        }[v],
      );
      opt.value = v;
      format.append(opt);
    }
    el('[data-type]').value = chart.type;
    el('[data-title]').value = chart.title;
    el('[data-axis]').value = chart.axisTitle;
    el('[data-palette]').value = chart.palette;
    el('[data-legend]').checked = chart.legend;
    el('[data-connect]').checked = chart.connectMissing;
    el('[data-bins]').value = chart.bins;
    el('[data-week]').value = chart.weekStart;
    el('[data-opening]').value = chart.opening;
    el('[data-gap-option]').hidden = ![
      'line-chart',
      'area-chart',
      'burndown-chart',
    ].includes(chart.type);
    el('[data-bins-option]').hidden = chart.type !== 'histogram';
    el('[data-week-option]').hidden = chart.type !== '2027-calendar-heatmap';
    el('[data-opening-option]').hidden = chart.type !== 'cash-flow-chart';
    grid();
    refresh();
  }
  function choose(p) {
    tab = p;
    for (const btn of all('[data-tab]'))
      btn.setAttribute('aria-pressed', String(btn.dataset.tab === tab));
    for (const pane of all('[data-pane]'))
      pane.hidden = pane.dataset.pane !== tab;
  }
  for (const btn of all('[data-tab]'))
    btn.onclick = () => choose(btn.dataset.tab);
  for (const [sel, prop, kind] of [
    ['title', 'title', 'text'],
    ['axis', 'axisTitle', 'text'],
    ['palette', 'palette', 'text'],
    ['legend', 'legend', 'check'],
    ['connect', 'connectMissing', 'check'],
    ['week', 'weekStart', 'text'],
    ['opening', 'opening', 'num'],
    ['bins', 'bins', 'num'],
  ]) {
    const input = el('[data-' + sel + ']');
    input.oninput = () => {
      chart[prop] =
        kind === 'check'
          ? input.checked
          : kind === 'num'
            ? Number(input.value)
            : input.value;
      changed(false);
    };
  }
  el('[data-type]').onchange = (e) => {
    save();
    open(e.target.value);
    sync();
  };
  el('[data-clear]').onclick = () => {
    chart.rows = [];
    grid();
    changed(true);
  };
  el('[data-add]').onclick = () => {
    if (chart.rows.length >= 500) {
      setError('The chart already has 500 rows.');
      return;
    }
    chart.rows.push(chart.headers.map(() => ''));
    grid();
    changed(true);
    el('[data-grid] tbody tr:last-child input')?.focus();
  };
  function apply(raw) {
    try {
      const [headers, ...rows] = Array.isArray(raw) ? raw : csvRows(raw);
      const imported = validate({ ...chart, headers, rows });
      chart.headers = imported.headers;
      chart.rows = imported.rows;
      grid();
      changed(true);
    } catch (e) {
      setError(e.message);
    }
  }
  el('[data-import]').onclick = () => apply(el('[data-paste]').value);
  el('[data-file]').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.name.toLowerCase().endsWith('.xlsx')) {
      try {
        if (f.size > 2000000) throw Error('Use an XLSX file under 2 MB.');
        const { workbookRows } = await import('./import-workbook.mjs');
        apply(workbookRows(await f.arrayBuffer()));
      } catch (err) {
        setError(err.message);
      }
      e.target.value = '';
      return;
    }
    if (f.size > 150000) {
      setError('Use a CSV file under 150 KB.');
      return;
    }
    try {
      apply(
        new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer()),
      );
    } catch {
      setError('Save the file as UTF-8 CSV.');
    }
    e.target.value = '';
  };
  async function call(url, body, method = 'POST', idempotent = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let result;
    try {
      result = await res.json();
    } catch {
      throw Error(
        'The export service is unavailable. Your chart is still in this tab.',
      );
    }
    if (!res.ok) {
      const gate = [
        'SIGNUP_REQUIRED',
        'MEMBERSHIP_REQUIRED',
        'EMAIL_VERIFICATION_REQUIRED',
      ].includes(result.code);
      el('[data-gate]').hidden = !gate;
      const message = {
        SIGNUP_REQUIRED:
          'Your five free selections have been used. Create an account for your 30-day trial.',
        MEMBERSHIP_REQUIRED: 'Membership is required for a new download.',
        EMAIL_VERIFICATION_REQUIRED:
          'Verify your email to activate your trial.',
        REVISION_CONFLICT:
          'A newer revision exists. Reopen the saved document.',
        RATE_LIMITED: 'Wait a moment and try again.',
        FORMAT_UNAVAILABLE: 'The selected output is unavailable.',
      }[result.code];
      throw Error(
        message ??
          'The request could not be completed. Your chart is still in this tab.',
      );
    }
    return result;
  }
  const submitChart = async (download) => {
    if (busy || !valid) return;
    busy = true;
    el('[data-export]').disabled = true;
    const data = structuredClone(valid);
    const controls = el('.controls');
    controls.inert = true;
    try {
      await call('/api/session', null, 'GET');
      if (record) {
        if (record.localRevision !== data.revision) {
          const res = await call(
            '/api/documents/' + encodeURIComponent(record.id),
            { expectedRevision: record.revision, data },
            'PATCH',
          );
          record = {
            id: res.id ?? record.id,
            revision: res.revision,
            localRevision: data.revision,
          };
        }
      } else {
        const tmpl =
          chart.type === original && templateId ? { templateId } : {};
        const res = await call('/api/documents', {
          kind: 'chart',
          ...tmpl,
          data,
        });
        record = {
          id: res.id,
          revision: res.revision,
          localRevision: data.revision,
        };
      }
      save();
      if (!download) {
        el('[data-status]').textContent =
          'Chart saved • Document revision ' + record.revision;
        return;
      }
      let job = await call(
        '/api/exports',
        {
          documentId: record.id,
          documentRevision: record.revision,
          format: el('[data-format]').value,
          paper: 'letter',
        },
        'POST',
        true,
      );
      job = await awaitExport(
        job,
        (t) => (el('[data-status]').textContent = t),
      );
      const ticket = await call(
        '/api/download-intents',
        job.intent,
        'POST',
        true,
      );
      const target = new URL(ticket.url, location.origin);
      if (target.origin !== location.origin)
        throw Error('The file link could not be validated.');
      location.assign(target.href);
    } catch (e) {
      setError(e.message);
    } finally {
      controls.inert = false;
      busy = false;
      el('[data-export]').disabled = !valid;
    }
  };
  el('[data-export]').onclick = () => submitChart(true);
  el('[data-save-doc]').onclick = () => submitChart(false);
  open(original);
  sync();
  choose(tab);
  const requestedId = new URLSearchParams(location.search).get('document');
  if (requestedId && /^[a-f0-9-]{36}$/i.test(requestedId)) {
    el('.controls').inert = true;
    call('/api/session', null, 'GET')
      .then(() => call('/api/documents/' + requestedId, null, 'GET'))
      .then((d) => {
        if (d.kind !== 'chart') throw Error('Choose a saved chart document.');
        chart = validate(d.data);
        original = chart.type;
        templateId = d.templateId ?? null;
        record = {
          id: requestedId,
          revision: d.revision,
          localRevision: chart.revision,
        };
        save();
        sync();
        el('[data-status]').textContent =
          'Saved document • Revision ' + d.revision;
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        el('.controls').inert = false;
      });
  }

  fetch('/api/chart-capabilities', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (c?.formats) {
        formats = c.formats;
        const prev = el('[data-format]').value;
        sync();
        if (formats[chart.type]?.includes(prev))
          el('[data-format]').value = prev;
      }
    })
    .catch(() => {});
}
document.querySelectorAll('.chart-studio').forEach(mount);
