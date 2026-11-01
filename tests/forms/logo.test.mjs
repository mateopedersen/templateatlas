import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { PDFDocument, PDFName } from 'pdf-lib';
import { invoiceLogo } from '../../src/forms/invoice-logo.mjs';
import { renderDocument } from '../../src/lib/render.mjs';
test('invoice logo embeds private raster bytes in PDF and Excel without touching totals', async () => {
  const bytes = await readFile(
      new URL('../fixtures/compact-logo.jpg', import.meta.url),
    ),
    logo = 'data:image/jpeg;base64,' + bytes.toString('base64');
  assert.equal(invoiceLogo(logo).width, 48);
  assert.throws(() => invoiceLogo('https://example.org/logo.jpg'));
  assert.throws(() => invoiceLogo('data:image/jpeg;base64,AAAA'));
  const data = {
    seller: 'Example company',
    buyer: 'Customer',
    number: 'INV-1',
    date: '2027-03-08',
    discount: '0',
    tax: '0',
    paid: '0',
    items: [
      { description: 'Session', quantity: '2', rate: '25.00', taxable: false },
    ],
    logo,
  };
  const { bytes: x } = await renderDocument({
      kind: 'invoice',
      data,
      format: 'xlsx',
    }),
    parts = unzipSync(x);
  assert.deepEqual(Buffer.from(parts['xl/media/company-logo.jpeg']), bytes);
  assert.match(strFromU8(parts['xl/drawings/drawing1.xml']), /Business logo/);
  assert.match(strFromU8(parts['xl/worksheets/sheet1.xml']), /<v>50<\/v>/);
  const p = await PDFDocument.load(
    (await renderDocument({ kind: 'invoice', format: 'pdf', data })).bytes,
  );
  const dict = p.getPages()[0].node.Resources().lookup(PDFName.of('XObject'));
  assert.ok(dict.keys().length > 0);
});
