import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import {
  field,
  starter,
  validateForm,
  moveField,
} from '../../src/forms/model.mjs';
import { exportForm } from '../../src/forms/export.mjs';
import { nativeEditor } from '../../src/native/editor.mjs';
test('same field IDs survive keyboard-style moves and validation', () => {
  const d = starter(),
    id = d.fields[0].id;
  assert.ok(moveField(d, id, 1));
  assert.equal(d.fields[1].id, id);
  assert.ok(moveField(d, id, -1));
  assert.ok(!moveField(d, id, -1));
  assert.equal(validateForm(d).fields[0].id, id);
  assert.throws(() =>
    validateForm({ ...d, fields: [d.fields[0], d.fields[0]] }),
  );
  assert.throws(() =>
    validateForm({
      ...d,
      fields: [{ ...field('choice'), options: ['One', 'one'] }],
    }),
  );
});
test('editable Word controls retain stable tags, field types and user text across revisions', async () => {
  const d = starter();
  d.fields.push(
    {
      ...field('checkbox'),
      label: 'I acknowledge the instructions',
      required: true,
    },
    { ...field('number'), label: 'Number of people' },
  );
  d.title = 'A & B <registration>';
  const { bytes, mime } = await exportForm(d, 'docx');
  assert.match(mime, /wordprocessingml/);
  const p = strFromU8(unzipSync(bytes)['word/document.xml']);
  assert.match(p, /A &amp; B &lt;registration&gt;/);
  assert.match(p, /w14:checkbox/);
  assert.match(p, /w:dropDownList/);
  assert.match(p, /w:multiLine="1"/);
  assert.match(p, /MM\/dd\/yyyy/);
  let n = -1;
  for (const f of d.fields) {
    let at = p.indexOf(f.id);
    assert.ok(at > n);
    n = at;
  }
  const getId = (xml, id) =>
    new RegExp('w:tag w:val="' + id + '"/><w:id w:val="(\\d+)"').exec(xml)?.[1];
  const id = d.fields[0].id;
  moveField(d, id, 1);
  assert.equal(
    getId(p, id),
    getId(
      strFromU8(
        unzipSync((await exportForm(d, 'docx')).bytes)['word/document.xml'],
      ),
      id,
    ),
  );
});
test('Letter PDF has real named fields, options, multiline response, required flags and pagination', async () => {
  const d = starter();
  d.fields.push({ ...field('checkbox'), label: 'Permission', required: true });
  for (let i = 0; i < 12; i++)
    d.fields.push({
      ...field('long'),
      label: 'Notes for session ' + (i + 1),
      help: 'Record your follow-up questions here.',
    });
  const pdf = await PDFDocument.load((await exportForm(d, 'pdf')).bytes);
  assert.ok(pdf.getPageCount() > 1);
  for (const page of pdf.getPages())
    assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  const form = pdf.getForm();
  assert.equal(form.getFields().length, d.fields.length);
  for (const f of d.fields) {
    const c = form.getField('field_' + f.id);
    assert.equal(c.isRequired(), f.required);
    if (f.type === 'long') assert.ok(c.isMultiline());
    if (f.type === 'choice') assert.deepEqual(c.getOptions(), f.options);
    if (f.type === 'checkbox') assert.equal(c.isChecked(), false);
  }
});
test('source-declared optional notes preserve required agreement clauses, signatures, and field IDs', () => {
  const p = 'word/document.xml',
    input =
      '<w:document><w:body><w:p><w:r><w:t>Party [Name]</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Working notes</w:t></w:r></w:p><w:p><w:r><w:t> </w:t></w:r></w:p><w:p><w:r><w:t>Signature [Signer]</w:t></w:r></w:p></w:body></w:document>',
    b = zipSync({ [p]: strToU8(input) });
  const fields = nativeEditor(b, 'docx').fields;
  assert.equal(fields[2].type, 'section');
  const out = strFromU8(
    unzipSync(nativeEditor(b, 'docx', { f1: 'Studio', f3: 'omit' }).bytes)[p],
  );
  assert.ok(!out.includes('Working notes'));
  assert.match(out, /Party Studio/);
  assert.match(out, /Signature \[Signer\]/);
  assert.throws(() => nativeEditor(b, 'docx', { f3: 'discard all' }));
});
