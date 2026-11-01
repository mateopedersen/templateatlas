import { zipSync, strToU8 } from 'fflate';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFHexString,
} from 'pdf-lib';
import { validateForm } from './model.mjs';
const dx =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rr = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c],
  );
const run = (s, size = 22, color = '2C3332', bold = false) =>
  '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>' +
  (bold ? '<w:b/>' : '') +
  '<w:color w:val="' +
  color +
  '"/><w:sz w:val="' +
  size +
  '"/></w:rPr><w:t xml:space="preserve">' +
  esc(s) +
  '</w:t></w:r>';
const para = (r, after = 85, keep = false) =>
  '<w:p><w:pPr>' +
  (keep ? '<w:keepNext/>' : '') +
  '<w:spacing w:after="' +
  after +
  '"/></w:pPr>' +
  r +
  '</w:p>';
function control(f, id) {
  const prefix =
    '<w:sdt><w:sdtPr><w:alias w:val="' +
    esc(f.label) +
    '"/><w:tag w:val="' +
    esc(f.id) +
    '"/><w:id w:val="' +
    id +
    '"/>';
  let type = '<w:text' + (f.type === 'long' ? ' w:multiLine="1"' : '') + '/>',
    display = '________________________________________________________';
  if (f.type === 'date') {
    type =
      '<w:date><w:dateFormat w:val="MM/dd/yyyy"/><w:lid w:val="en-US"/><w:calendar w:val="gregorian"/></w:date>';
    display = '____ / ____ / ________';
  }
  if (f.type === 'number') display = '_______________________';
  if (f.type === 'choice') {
    type =
      '<w:dropDownList>' +
      f.options
        .map(
          (o) =>
            '<w:listItem w:displayText="' +
            esc(o) +
            '" w:value="' +
            esc(o) +
            '"/>',
        )
        .join('') +
      '</w:dropDownList>';
    display = 'Select an option';
  }
  if (f.type === 'checkbox') {
    type =
      '<w14:checkbox><w14:checked w14:val="0"/><w14:checkedState w14:val="2612" w14:font="Segoe UI Symbol"/><w14:uncheckedState w14:val="2610" w14:font="Segoe UI Symbol"/></w14:checkbox>';
    display = '☐';
  }
  return (
    prefix +
    type +
    '</w:sdtPr><w:sdtContent>' +
    run(display, 23, '596760') +
    '</w:sdtContent></w:sdt>'
  );
}
function docx(m) {
  const ids = new Map(),
    used = new Set();
  for (const id of m.fields.map((f) => f.id).sort()) {
    let n = 2166136261;
    for (const ch of id) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
    n = n >>> 1;
    while (used.has(n)) n = (n + 1) & 0x7fffffff;
    used.add(n);
    ids.set(id, n);
  }
  const p = [
    para(
      run('TEMPLATEATLAS    /    FORM STUDIO', 18, '35675F', true),
      130,
      true,
    ),
    para(run(m.title, 40, '702C42', true), 140, true),
  ];
  if (m.description) p.push(para(run(m.description), 155, true));
  if (m.fields.some((f) => f.required))
    p.push(para(run('* Required field', 19, '526561'), 185, true));
  m.fields.forEach((f, i) => {
    p.push(
      para(
        run(
          i + 1 + '. ' + f.label + (f.required ? ' *' : ''),
          24,
          '342F2C',
          true,
        ),
        55,
        true,
      ),
    );
    if (f.help) p.push(para(run(f.help, 20, '55615D'), 45, true));
    if (f.type === 'choice')
      p.push(
        para(run(f.options.map((o) => '○ ' + o).join('     '), 21), 60, true),
      );
    p.push(para(control(f, ids.get(f.id)), f.type === 'long' ? 55 : 160));
    if (f.type === 'long')
      p.push(
        para(
          run(
            '________________________________________________________',
            22,
            '596760',
          ),
          155,
        ),
      );
  });
  p.push(
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="860" w:right="960" w:bottom="850" w:left="960" w:header="360" w:footer="360"/></w:sectPr>',
  );
  const files = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' +
      rr +
      '/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"><w:body>' +
      p.join('') +
      '</w:body></w:document>',
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [
        k,
        strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + v),
      ]),
    ),
    { level: 5 },
  );
}
const wine = rgb(0.44, 0.17, 0.26),
  ink = rgb(0.17, 0.19, 0.18),
  muted = rgb(0.31, 0.38, 0.35),
  light = rgb(0.72, 0.76, 0.73);
async function pdf(m) {
  const doc = await PDFDocument.create(),
    regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold),
    form = doc.getForm();
  doc.setTitle(m.title);
  doc.setLanguage('en-US');
  function wrapped(s, font, size, width) {
    const out = [];
    for (const paragraph of s.split(/\r?\n/)) {
      let line = '';
      for (const token of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? line + ' ' + token : token;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) {
          out.push(line);
          line = '';
        }
        for (const ch of token) {
          if (line && font.widthOfTextAtSize(line + ch, size) > width) {
            out.push(line);
            line = '';
          }
          line += ch;
        }
      }
      out.push(line);
    }
    return out;
  }
  let page, y;
  const x = 48,
    width = 516;
  function lines(list, font, size, color) {
    for (const l of list) {
      if (l) page.drawText(l, { x, y, font, size, color });
      y -= size * 1.28;
    }
  }
  function newPage(first = false) {
    page = doc.addPage([612, 792]);
    y = 747;
    page.drawText('TEMPLATEATLAS  /  FORM STUDIO', {
      x,
      y,
      font: bold,
      size: 9,
      color: muted,
    });
    y -= 32;
    lines(
      wrapped(m.title, bold, first ? 23 : 15, width),
      bold,
      first ? 23 : 15,
      wine,
    );
    y -= 4;
    if (first && m.description) {
      lines(wrapped(m.description, regular, 11, width), regular, 11, ink);
      y -= 7;
    }
    if (first && m.fields.some((f) => f.required)) {
      lines(['* Required field'], regular, 10, muted);
      y -= 4;
    }
  }
  newPage(true);
  for (const [i, f] of m.fields.entries()) {
    const title = wrapped(
        i + 1 + '. ' + f.label + (f.required ? ' *' : ''),
        bold,
        12,
        width,
      ),
      hint = f.help ? wrapped(f.help, regular, 10, width) : [];
    const optionLines = f.options.map((o) =>
      wrapped(o, regular, 11, width - 32),
    );
    const content =
      f.type === 'choice'
        ? optionLines.reduce((s, l) => s + Math.max(18, l.length * 14 + 5), 0)
        : f.type === 'long'
          ? 60
          : f.type === 'checkbox'
            ? 19
            : 29;
    const needs = title.length * 15.36 + hint.length * 12.8 + content + 25;
    if (y - needs < 42) newPage();
    lines(title, bold, 12, ink);
    if (hint.length) lines(hint, regular, 10, muted);
    y -= 3;
    const name = 'field_' + f.id;
    let control;
    if (f.type === 'choice') {
      control = form.createRadioGroup(name);
      for (const [j, o] of f.options.entries()) {
        control.addOptionToPage(o, page, {
          x: x + 2,
          y: y - 11,
          width: 12,
          height: 12,
          borderColor: muted,
          borderWidth: 0.8,
        });
        const at = y;
        for (const l of optionLines[j]) {
          page.drawText(l, {
            x: x + 24,
            y: y - 9,
            font: regular,
            size: 11,
            color: ink,
          });
          y -= 14;
        }
        y = at - Math.max(18, optionLines[j].length * 14 + 5);
      }
    } else if (f.type === 'checkbox') {
      control = form.createCheckBox(name);
      control.addToPage(page, {
        x: x + 2,
        y: y - 13,
        width: 14,
        height: 14,
        borderWidth: 0.9,
        borderColor: muted,
      });
      y -= 19;
    } else {
      control = form.createTextField(name);
      if (f.type === 'long') control.enableMultiline();
      const ht = f.type === 'long' ? 55 : 23,
        w = f.type === 'date' || f.type === 'number' ? 200 : width;
      control.addToPage(page, {
        x,
        y: y - ht,
        width: w,
        height: ht,
        borderWidth: 0.7,
        borderColor: light,
        font: regular,
        textColor: ink,
      });
      control.setFontSize(11);
      if (f.type === 'date') control.setMaxLength(10);
      y -= ht + 5;
    }
    control.acroField.dict.set(
      PDFName.of('TU'),
      PDFHexString.fromText(
        f.label +
          (f.type === 'date'
            ? ' (MM/DD/YYYY)'
            : f.type === 'number'
              ? ' (number)'
              : ''),
      ),
    );
    if (f.required) control.enableRequired();
    y -= 13;
  }
  for (const [i, p] of doc.getPages().entries()) {
    p.drawText('Page ' + (i + 1) + ' of ' + doc.getPageCount(), {
      x: 48,
      y: 25,
      font: regular,
      size: 9,
      color: muted,
    });
  }
  form.updateFieldAppearances(regular);
  return doc.save();
}
export async function exportForm(raw, format) {
  const model = validateForm(raw);
  if (format === 'docx') return { bytes: docx(model), mime: dx };
  if (format === 'pdf')
    return { bytes: await pdf(model), mime: 'application/pdf' };
  throw Error('Choose Word or PDF.');
}
