import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { initial, types } from '../../src/charts/model.mjs';
import { chartFormats, exportChart } from '../../src/charts/exports.mjs';
test('workbooks have live chart references and typed cells for all nine supported types', () => {
  const supported = Object.keys(types).filter((k) =>
    chartFormats(k).includes('xlsx'),
  );
  assert.equal(supported.length, 9);
  for (const type of supported) {
    const { bytes, mime } = exportChart(initial(type), 'xlsx');
    assert.match(mime, /spreadsheetml/);
    const parts = unzipSync(bytes);
    const c = strFromU8(parts['xl/charts/chart1.xml']);
    assert.match(c, /Data!\$[AB]\$5:\$[AB]\$\d+/);
    assert.match(c, /<c:ptCount /);
    assert.match(c, /<c:dispBlanksAs val="gap"/);
    if (type === 'bubble-chart') assert.match(c, /<c:bubbleSize>.*Data!\$C\$5/);
    if (type === 'stacked-bar-chart') assert.match(c, /grouping val="stacked"/);
  }
});
test('formula-like labels remain text cells, internal XML is escaped and invalid charts are denied', () => {
  const doc = initial('bar-graph');
  doc.rows = [
    ['=2+2', 4],
    ['<tag>', 6],
  ];
  const x = strFromU8(
    unzipSync(exportChart(doc, 'xlsx').bytes)['xl/worksheets/sheet1.xml'],
  );
  assert.match(x, /<t xml:space="preserve">=2\+2<\/t>/);
  assert.match(x, /&lt;tag&gt;/);
  assert.doesNotMatch(x, /<f>/);
  assert.throws(() => exportChart(initial('sankey-diagram'), 'xlsx'));
  assert.throws(() =>
    exportChart({ ...initial('line-chart'), rows: [] }, 'xlsx'),
  );
});
