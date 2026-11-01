import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { nativeEditor } from '../../src/native/editor.mjs';
import {
  checkNativeSource,
  nativeFields,
  renderNative,
} from '../../src/native/service.mjs';
const pack = (parts) =>
  zipSync(
    Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)])),
  );
const read = (b, p) => strFromU8(unzipSync(b)[p]);
test('Word fields crossing text runs keep styling and separate occurrences', () => {
  const part = 'word/document.xml',
    b = pack({
      [part]:
        '<w:document><w:p><w:r><w:t>Approved by [na</w:t></w:r><w:r><w:t>me]. Due [date].</w:t></w:r></w:p><w:p><w:r><w:t>Reviewed [date].</w:t></w:r></w:p></w:document>',
      'word/styles.xml': '<unchanged/>',
    });
  const f = nativeEditor(b, 'docx').fields;
  assert.equal(f.length, 3);
  assert.match(f[0].label, /Approved by/);
  const out = nativeEditor(b, 'docx', { f1: 'A & B', f2: 'April 4' }).bytes;
  assert.match(read(out, part), /Approved by A &amp; B/);
  assert.match(read(out, part), /Due April 4/);
  assert.match(read(out, part), /Reviewed \[date\]/);
  assert.equal(read(out, 'word/styles.xml'), '<unchanged/>');
  assert.throws(() => nativeEditor(b, 'docx', { f99: 'X' }));
});
test('repeated SVG print labels share one field; markup stays inert', () => {
  const b = strToU8(
    '<svg><g><text x="3">Visitor name</text></g><g><text x="20">Visitor name</text></g></svg>',
  );
  assert.equal(nativeEditor(b, 'svg').fields.length, 1);
  assert.match(
    strFromU8(nativeEditor(b, 'svg', { f1: '<tag>' }).bytes),
    /x="3">&lt;tag&gt;/,
  );
  assert.match(
    strFromU8(nativeEditor(b, 'svg', { f1: '<tag>' }).bytes),
    /x="20">&lt;tag&gt;/,
  );
  assert.throws(() =>
    nativeEditor(strToU8('<svg><script>alert(1)</script></svg>'), 'svg'),
  );
});
test('PowerPoint changes editable runs while keeping unrelated presentation components', () => {
  const p = 'ppt/slides/slide1.xml',
    b = pack({
      [p]: '<p:sp><a:p><a:r><a:t>[Recipient]</a:t></a:r></a:p></p:sp>',
      'ppt/theme/theme1.xml': '<t/>',
    });
  const r = nativeEditor(b, 'pptx', { f1: 'City Studio' });
  assert.match(read(r.bytes, p), /City Studio/);
  assert.equal(read(r.bytes, 'ppt/theme/theme1.xml'), '<t/>');
});
test('Excel only edits allowed worksheet cells, strips formula caches, accepts literal formula-like text', () => {
  const p = 'xl/worksheets/sheet1.xml',
    b = pack({
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="Ledger" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/styles.xml':
        '<styleSheet><fonts><font><color rgb="FFFFFFFF"/></font><font><color rgb="FF1F526C"/></font></fonts><cellXfs><xf fontId="0"/><xf fontId="1" numFmtId="0"/></cellXfs></styleSheet>',
      [p]: '<worksheet><sheetData><row><c r="A5" t="str"><v>Job number</v></c><c r="B5" t="str"><v>Units</v></c></row><row><c r="A6" s="1" t="str"><v>S-1</v></c><c r="B6" s="1"><v>4</v></c><c r="C6"><f>B6*2</f><v>8</v></c></row></sheetData></worksheet>',
    });
  const f = nativeEditor(b, 'xlsx').fields;
  assert.equal(f.length, 2);
  assert.equal(f[1].type, 'number');
  assert.match(f[0].label, /Job number/);
  assert.throws(() => nativeEditor(b, 'xlsx', { f2: '=2+2' }));
  const out = nativeEditor(b, 'xlsx', { f1: '=2+2', f2: '7.5' }).bytes;
  assert.match(read(out, p), /<t xml:space="preserve">=2\+2<\/t>/);
  assert.match(read(out, p), /<v>7.5<\/v>/);
  assert.match(read(out, p), /<f>B6\*2<\/f><\/c>/);
  assert.match(read(out, 'xl/workbook.xml'), /fullCalcOnLoad="1"/);
});
test('native source binds reviewed version and checksum before editing', async () => {
  const data = strToU8('<svg><text>Guest</text></svg>'),
    hash = Buffer.from(await crypto.subtle.digest('SHA-256', data)).toString(
      'hex',
    );
  const row = {
    format: 'svg',
    mime: 'image/svg+xml',
    version: 'v1',
    object_key: 'private',
    size_bytes: data.length,
    sha256: hash,
  };
  const env = {
    DB: {
      prepare: () => ({
        bind: (id, version) => ({
          first: async () =>
            id === 'ta-card-001' &&
            (version === 'ta-card-001' || version === 'v1')
              ? row
              : null,
        }),
      }),
    },
    ASSET_ORIGINALS: {
      get: async () => ({
        size: data.length,
        customMetadata: { sha256: hash },
        arrayBuffer: async () => data,
      }),
    },
  };
  const schema = await nativeFields(env, 'ta-card-001');
  assert.equal(schema.format, 'svg');
  assert.equal(schema.fields[0].label, 'Guest');
  assert.ok(!JSON.stringify(schema).includes('private'));
  const draft = {
    title: 'My card',
    sourceHash: hash,
    sourceVersion: 'v1',
    edits: { f1: 'Mira' },
  };
  await checkNativeSource(env, 'ta-card-001', draft);
  const doc = { template_id: 'ta-card-001', source_version: 'v1' };
  assert.match(
    strFromU8((await renderNative(env, doc, draft, 'svg')).bytes),
    />Mira</,
  );
  await assert.rejects(() => renderNative(env, doc, draft, 'pptx'));
  await assert.rejects(() =>
    checkNativeSource(env, 'ta-card-001', { ...draft, sourceVersion: 'v2' }),
  );
  await assert.rejects(() =>
    renderNative(env, doc, { ...draft, sourceHash: '0'.repeat(64) }, 'svg'),
  );
});
