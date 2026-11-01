import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, tools } from '../src/lib/tools.mjs';
import { renderDocument } from '../src/lib/render.mjs';
import { invoice } from '../src/lib/invoice.mjs';
import { unzipSync, strFromU8 } from 'fflate';
const defaults = (k) =>
  Object.fromEntries(tools[k].fields.map((x) => [x.name, x.value]));
for (const [kind, t] of Object.entries(tools))
  test(t.title + ' renders a real US Letter PDF', async () => {
    const data = defaults(kind);
    assert.ok(calculate(kind, data).rows.length);
    const { bytes } = await renderDocument({ kind, data, format: 'pdf' });
    assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
  });
test('Calendar and calculation fixtures', () => {
  const run = (k, d) => calculate(k, { ...defaults(k), ...d });
  assert.equal(run('grade-calculator', {}).summary, '86%');
  assert.equal(run('aspect-ratio-calculator', {}).summary, '16:9');
  assert.equal(
    run('hex-to-decimal-converter', { hex: 'FFFFFFFFFFFFFFFF' }).summary,
    '18446744073709551615',
  );
  assert.match(run('weeks-in-year', {}).summary, /52 ISO/);
  assert.match(run('weeks-in-year', { year: 2026 }).summary, /53 ISO/);
  assert.equal(run('calendar-2027', {}).rows[0][5], "1 · New Year's Day");
  assert.match(
    run('calendar-2027', { month: 6 }).rows.flat().join(' '),
    /18 · Juneteenth.*observed/,
  );
  assert.equal(
    run('significant-figures-calculator', { value: '1.20e3' }).summary,
    '3 significant figures',
  );
  assert.deepEqual(
    run('venn-diagram-maker', { a: '1\n2', b: '2\n3' }).rows.at(-1),
    ['A ∩ B only', '2'],
  );
  assert.throws(() =>
    run('schedule-maker', { rows: '2027-01-02,10:00,09:00,Bad' }),
  );
});
test('Invoice fixture and editable Excel formulas', async () => {
  const data = {
    seller: 'Sample firm',
    buyer: 'Sample client',
    number: 'INV-100',
    date: '2026-11-01',
    items: [
      { description: 'Consulting', quantity: '2', rate: '100', taxable: true },
      { description: 'Preparation', quantity: '1', rate: '75', taxable: true },
    ],
    discount: '10',
    tax: '8',
    paid: '50',
  };
  const v = invoice(data);
  assert.deepEqual(
    [v.subtotal, v.discount, v.taxable, v.tax, v.total, v.balance],
    [27500, 2750, 24750, 1980, 26730, 21730],
  );
  const { bytes } = await renderDocument({
    kind: 'invoice',
    templateId: 'ta-invoice-001',
    data,
    format: 'xlsx',
  });
  const sheet = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /<f>ROUND\(B6\*C6,2\)<\/f>/);
  assert.match(sheet, /<v>217.3<\/v>/);
  data.items[1].taxable = false;
  assert.equal(invoice(data).tax, 1440);
});
