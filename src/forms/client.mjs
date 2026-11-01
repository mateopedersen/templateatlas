import {
  fieldTypes,
  field,
  starter,
  validateForm,
  moveField,
} from './model.mjs';
import { api, download } from '../lib/client.mjs';
import { awaitExport } from '../lib/export-state.mjs';
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
function designer(root) {
  const get = (q) => root.querySelector(q),
    title = get('[data-form-title]'),
    desc = get('[data-form-desc]'),
    container = get('[data-form-fields]'),
    preview = get('[data-form-preview]'),
    state = (t) => (get('[data-form-state]').textContent = t);
  const requested = new URLSearchParams(location.search).get('document');
  const starterKey = new URLSearchParams(location.search).get('new');
  const key =
    'templateatlas.form.v1.' +
    (requested ??
      (starterKey && /^[a-f0-9-]{36}$/i.test(starterKey) ? starterKey : 'new'));
  let model = starter(),
    record = null,
    openId = model.fields[0].id,
    busy = false;
  try {
    const local = JSON.parse(sessionStorage.getItem(key));
    if (local?.model && Array.isArray(local.model.fields)) {
      model = local.model;
      record = local.record ?? null;
    }
  } catch {}
  function cache() {
    try {
      sessionStorage.setItem(key, JSON.stringify({ model, record }));
      return true;
    } catch {
      return false;
    }
  }
  function update() {
    const ok = cache();
    showPreview();
    state(
      ok
        ? 'Draft saved in this tab.'
        : 'Keep this page open. Your browser could not save this draft.',
    );
  }
  function summary(f, i) {
    return (
      i +
      1 +
      '. ' +
      (f.label.trim() || 'Untitled question') +
      ' · ' +
      fieldTypes[f.type] +
      (f.required ? ' · required' : '')
    );
  }
  function label(text, input) {
    const e = node('label', text);
    e.append(input);
    return e;
  }
  function button(text, click, disabled = false) {
    const b = node('button', text);
    b.type = 'button';
    b.disabled = disabled;
    b.onclick = click;
    return b;
  }
  function showPreview() {
    preview.replaceChildren(node('h3', model.title || 'Untitled form'));
    if (model.description) preview.append(node('p', model.description));
    for (const [i, f] of model.fields.entries()) {
      preview.append(
        node(
          'h4',
          i +
            1 +
            '. ' +
            (f.label || 'Untitled question') +
            (f.required ? ' *' : ''),
        ),
      );
      if (f.help) preview.append(node('p', f.help));
      if (f.type === 'choice') {
        for (const v of f.options) preview.append(node('p', '○  ' + v));
      } else if (f.type === 'checkbox') preview.append(node('p', '☐'));
      else if (f.type === 'date')
        preview.append(node('p', '____ / ____ / ________'));
      else {
        const line = node('span');
        line.className = 'write-line' + (f.type === 'long' ? ' long' : '');
        preview.append(line);
      }
    }
  }
  function reorder(id, dir) {
    if (moveField(model, id, dir)) {
      openId = id;
      draw();
      container.querySelector('[data-id="' + id + '"] summary').focus();
      update();
      state(
        'Moved to question ' +
          (model.fields.findIndex((x) => x.id === id) + 1) +
          '.',
      );
    }
  }
  function draw() {
    title.value = model.title;
    desc.value = model.description;
    container.replaceChildren();
    for (const [i, f] of model.fields.entries()) {
      const box = node('details');
      box.dataset.id = f.id;
      box.open = f.id === openId;
      const top = node('summary', summary(f, i));
      box.append(top);
      top.onclick = () => {
        openId = box.open ? null : f.id;
      };
      box.onkeydown = (e) => {
        if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          reorder(f.id, e.key === 'ArrowUp' ? -1 : 1);
        }
      };
      const group = node('fieldset'),
        name = node('input');
      name.maxLength = 90;
      name.value = f.label;
      name.oninput = () => {
        f.label = name.value;
        top.textContent = summary(f, i);
        update();
      };
      group.append(label('Question label', name));
      const select = node('select');
      for (const [type, s] of Object.entries(fieldTypes)) {
        const o = node('option', s);
        o.value = type;
        select.append(o);
      }
      select.value = f.type;
      select.onchange = () => {
        f.type = select.value;
        f.options = f.type === 'choice' ? ['Option A', 'Option B'] : [];
        openId = f.id;
        draw();
        update();
      };
      group.append(label('Response type', select));
      const help = node('input');
      help.maxLength = 180;
      help.value = f.help;
      help.oninput = () => {
        f.help = help.value;
        update();
      };
      group.append(label('Help text', help));
      const req = node('input');
      req.type = 'checkbox';
      req.checked = f.required;
      req.oninput = () => {
        f.required = req.checked;
        top.textContent = summary(f, i);
        update();
      };
      const check = node('label');
      check.append(req, document.createTextNode(' Required field'));
      group.append(check);
      if (f.type === 'choice') {
        const options = node('textarea');
        options.rows = 4;
        options.value = f.options.join('\n');
        options.oninput = () => {
          f.options = options.value.split(/\r?\n/);
          update();
        };
        group.append(label('Options · one per line', options));
      }
      group.append(
        button('Move up', () => reorder(f.id, -1), i === 0),
        button(
          'Move down',
          () => reorder(f.id, 1),
          i === model.fields.length - 1,
        ),
        button('Remove field', () => {
          model.fields.splice(i, 1);
          openId =
            model.fields[Math.min(i, model.fields.length - 1)]?.id ?? null;
          draw();
          update();
        }),
      );
      box.append(group);
      container.append(box);
    }
    showPreview();
  }
  title.oninput = () => {
    model.title = title.value;
    update();
  };
  desc.oninput = () => {
    model.description = desc.value;
    update();
  };
  get('[data-add-field]').onclick = () => {
    if (model.fields.length >= 30) {
      state('A form supports up to 30 questions.');
      return;
    }
    const f = field(get('[data-new-field]').value);
    model.fields.push(f);
    openId = f.id;
    draw();
    container.querySelector('[data-id="' + f.id + '"] input').select();
    update();
  };
  async function submit(format) {
    if (busy) return;
    busy = true;
    root.querySelector('.form-controls').inert = true;
    root.querySelector('.form-actions').inert = true;
    try {
      const data = validateForm(model);
      await api('/api/session');
      const snap = JSON.stringify(data);
      if (!record) {
        const d = await api('/api/documents', { kind: 'form', data });
        record = { id: d.id, revision: d.revision, snap };
      } else if (record.snap !== snap) {
        const d = await api(
          '/api/documents/' + record.id,
          { data, expectedRevision: record.revision },
          'PATCH',
        );
        record = { id: d.id, revision: d.revision, snap };
      }
      cache();
      if (!format) {
        state('Form saved • Revision ' + record.revision + '.');
        return;
      }
      state('Preparing your ' + format.toUpperCase() + ' file…');
      const job = await api(
        '/api/exports',
        {
          documentId: record.id,
          documentRevision: record.revision,
          format,
          paper: 'letter',
        },
        'POST',
        record.id + '-' + record.revision + '-' + format,
      );
      await download((await awaitExport(job, state)).intent);
      state('Your file is ready.');
    } catch (e) {
      get('[data-form-gate]').hidden = ![
        'SIGNUP_REQUIRED',
        'EMAIL_VERIFICATION_REQUIRED',
        'MEMBERSHIP_REQUIRED',
      ].includes(e.code);
      state(e.message);
    } finally {
      busy = false;
      root.querySelector('.form-controls').inert = false;
      root.querySelector('.form-actions').inert = false;
    }
  }
  get('[data-save-form]').onclick = () => submit(null);
  root
    .querySelectorAll('[data-export-form]')
    .forEach((b) => (b.onclick = () => submit(b.dataset.exportForm)));
  get('[data-new-form]').href = '/create/form/?new=' + crypto.randomUUID();
  draw();
  if (requested && /^[a-f0-9-]{36}$/i.test(requested)) {
    root.inert = true;
    api('/api/session')
      .then(() => api('/api/documents/' + requested))
      .then((d) => {
        if (d.kind !== 'form') throw Error('Open a saved form in Form Studio.');
        model = validateForm(d.data);
        record = {
          id: d.id,
          revision: d.revision,
          snap: JSON.stringify(model),
        };
        openId = model.fields[0].id;
        draw();
        cache();
        state('Saved form • Revision ' + d.revision + '.');
      })
      .catch((e) => state(e.message))
      .finally(() => {
        root.inert = false;
      });
  }
}
document.querySelectorAll('.form-designer').forEach(designer);
