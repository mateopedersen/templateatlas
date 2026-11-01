import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { calculate } from '../src/lib/tools.mjs';
import { renderDocument, formatsFor } from '../src/lib/render.mjs';

test('Venn exports two or three editable circles, accurate exclusive counts and inert member text', async () => {
  for (const c of ['', 'birch\noak']) {
    const data = {
      a: 'oak\noak\nmaple',
      b: 'maple\nfir\n<a&b>',
      c,
      nameA: 'Woodland',
      nameB: 'Park',
    };
    const report = calculate('venn-diagram-maker', data);
    assert.equal(
      report.regionData.find((v) => v.label === 'A ∩ B only').members.join(),
      'maple',
    );
    assert.ok(formatsFor('venn-diagram-maker').includes('pptx'));
    const result = await renderDocument({
      kind: 'venn-diagram-maker',
      data,
      format: 'pptx',
    });
    assert.equal(
      result.mime,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    const pkg = unzipSync(result.bytes),
      xml = strFromU8(pkg['ppt/slides/slide1.xml']);
    assert.equal((xml.match(/prst="ellipse"/g) || []).length, c ? 3 : 2);
    assert.ok(xml.includes('Woodland'));
    assert.ok(!Object.keys(pkg).some((n) => n.startsWith('ppt/media/')));
    const next = strFromU8(pkg['ppt/slides/slide2.xml']);
    assert.match(next, /&lt;a&amp;b&gt;/);
    assert.match(next, /A ∩ B only/);
    const svg = strFromU8(
      (
        await renderDocument({
          kind: 'venn-diagram-maker',
          data,
          format: 'svg',
        })
      ).bytes,
    );
    assert.match(svg, /&lt;a&amp;b&gt;/);
    assert.match(svg, /Woodland/);
  }
});
test('week reference covers every civil date exactly once, including adjacent ISO years', async () => {
  for (const start of ['Sunday', 'Monday']) {
    const r = calculate('weeks-in-year', { year: '2027', start });
    assert.equal(
      r.rows.reduce((n, a) => n + a[2], 0),
      365,
    );
    assert.equal(r.rows[0][0], '2027-01-01');
    assert.equal(r.rows[0][3], '2026-W53');
    assert.equal(r.rows.at(-1)[1], '2027-12-31');
    assert.equal(r.rows.at(-1)[4], '2027-W52');
    const xml = strFromU8(
      unzipSync(
        (
          await renderDocument({
            kind: 'weeks-in-year',
            format: 'xlsx',
            data: { year: 2027, start },
          })
        ).bytes,
      )['xl/worksheets/sheet1.xml'],
    );
    assert.match(xml, /2026-W53/);
  }
});
test('schedule overlap is symmetric, adjacent events are clear, and empty results remain printable', async () => {
  const data = {
    rows: '2027-01-05,10:00,11:00,Review\n2027-01-05,09:00,10:30,Setup\n2027-01-05,11:00,12:00,Handoff',
  };
  assert.deepEqual(
    calculate('schedule-maker', data).rows.map((r) => r[4]),
    ['Overlap', 'Overlap', 'Clear'],
  );
  assert.throws(() =>
    calculate('schedule-maker', { rows: '2027-01-05,12:00,11:00,Invalid' }),
  );
  assert.equal(calculate('schedule-maker', { rows: '' }).events.length, 0);
  const pdf = await renderDocument({
    kind: 'schedule-maker',
    format: 'pdf',
    data: { rows: '' },
  });
  assert.equal(strFromU8(pdf.bytes.slice(0, 4)), '%PDF');
  const xlsx = strFromU8(
    unzipSync(
      (await renderDocument({ kind: 'schedule-maker', format: 'xlsx', data }))
        .bytes,
    )['xl/worksheets/sheet1.xml'],
  );
  assert.match(xlsx, /Handoff/);
  const ics = strFromU8(
    (await renderDocument({ kind: 'schedule-maker', format: 'ics', data }))
      .bytes,
  );
  assert.match(ics, /DTSTART:20270105T090000/);
  assert.match(ics, /DTEND:20270105T103000/);
});
