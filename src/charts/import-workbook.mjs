// Read data cells only. No formulas, relationships to external URLs, or macros are followed.
import { unzipSync, strFromU8 } from 'fflate';
const sheetNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relNS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function parse(bytes) {
  if (!bytes) throw Error('A required spreadsheet part is missing.');
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/.test(text))
    throw Error('This spreadsheet contains unsupported XML declarations.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw Error('The spreadsheet contains invalid XML.');
  return doc;
}
const tags = (n, t) => [...n.getElementsByTagNameNS(sheetNS, t)];
export function workbookRows(buffer) {
  if (buffer.byteLength > 2_000_000)
    throw Error('Use an XLSX file under 2 MB.');
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 80 || bytes[1] !== 75)
    throw Error('Choose a real XLSX workbook.');
  let total = 0,
    entries = 0;
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (
          ++entries > 500 ||
          f.originalSize > 2_000_000 ||
          (total += f.originalSize) > 8_000_000
        )
          throw Error('This workbook is too large to import.');
        if (
          f.name.includes('..') ||
          f.name.startsWith('/') ||
          /vbaProject|externalLinks/i.test(f.name)
        )
          throw Error('Use a workbook without macros or external links.');
        return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(
          f.name,
        );
      },
    });
  } catch (e) {
    throw Error(e.message || 'The workbook could not be opened.');
  }
  const wb = parse(files['xl/workbook.xml']),
    s = tags(wb, 'sheet')[0];
  if (!s) throw Error('Add a worksheet with a header row.');
  const id = s.getAttributeNS(relNS, 'id'),
    rels = parse(files['xl/_rels/workbook.xml.rels']);
  const link = [...rels.getElementsByTagNameNS('*', 'Relationship')].find(
    (n) =>
      n.getAttribute('Id') === id &&
      n.getAttribute('Type') === relNS + '/worksheet' &&
      n.getAttribute('TargetMode') !== 'External',
  );
  if (!link) throw Error('The first worksheet must contain data cells.');
  const target = link.getAttribute('Target'),
    key = target.startsWith('/xl/') ? target.slice(1) : 'xl/' + target;
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(key))
    throw Error('Invalid worksheet location.');
  const shared = files['xl/sharedStrings.xml']
    ? tags(parse(files['xl/sharedStrings.xml']), 'si').map((si) =>
        tags(si, 't')
          .map((t) => t.textContent)
          .join(''),
      )
    : [];
  const rows = [];
  let width = 0;
  for (const row of tags(parse(files[key]), 'row')) {
    const vals = [];
    for (const c of tags(row, 'c')) {
      const ref = c.getAttribute('r') ?? '',
        letters = /^([A-Z]+)\d+$/.exec(ref)?.[1];
      if (!letters) throw Error('A cell is missing its address.');
      const idx =
        [...letters].reduce((s, v) => 26 * s + v.charCodeAt(0) - 64, 0) - 1;
      if (idx > 31) throw Error('Use at most 32 columns.');
      if (tags(c, 'f').length)
        throw Error(
          'Copy and paste values into a plain worksheet before importing formulas.',
        );
      const t = c.getAttribute('t'),
        v = tags(c, 'v')[0]?.textContent ?? '';
      if (t === 'e') throw Error('Fix spreadsheet errors before importing.');
      if (!v && t !== 'inlineStr') continue;
      vals[idx] =
        t === 's'
          ? (shared[Number(v)] ?? '')
          : t === 'inlineStr'
            ? tags(c, 't')
                .map((n) => n.textContent)
                .join('')
            : v;
    }
    if (vals.some((v) => v !== '')) {
      width = Math.max(width, vals.length);
      rows.push(vals);
      if (rows.length > 501) throw Error('Use at most 500 data rows.');
    }
  }
  if (rows.length < 2)
    throw Error('The first worksheet needs a header row and some data.');
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}
