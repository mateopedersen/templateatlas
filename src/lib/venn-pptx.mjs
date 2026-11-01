// The packaged theme and layouts come from a new blank 16:9 presentation.
// The generated diagram consists only of editable PowerPoint shapes and text.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import emptyPresentation from './venn-layout.json' with { type: 'json' };

const office =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pres = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const drawing = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const colors = ['712B46', '286F64', '5F688D'];
const esc = (v) =>
  String(v)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const coordinates = (n) =>
  n === 2
    ? [
        [370, 310],
        [560, 310],
      ]
    : [
        [370, 285],
        [560, 285],
        [465, 430],
      ];
const regions = (n) =>
  n === 2
    ? [
        [305, 310],
        [625, 310],
        [465, 310],
      ]
    : [
        [308, 263],
        [620, 263],
        [465, 218],
        [465, 509],
        [369, 400],
        [560, 400],
        [465, 334],
      ];
const toEmu = (v) => Math.round(v * 9525);
const xfrm = (x, y, w, h) =>
  '<a:xfrm><a:off x="' +
  toEmu(x) +
  '" y="' +
  toEmu(y) +
  '"/><a:ext cx="' +
  toEmu(w) +
  '" cy="' +
  toEmu(h) +
  '"/></a:xfrm>';
const beginShape = (id, name, spPr) =>
  '<p:sp><p:nvSpPr><p:cNvPr id="' +
  id +
  '" name="' +
  esc(name) +
  '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>' +
  spPr +
  '</p:spPr>';
function textBox(id, name, value, x, y, w, h, size = 22, opts = {}) {
  const props =
    xfrm(x, y, w, h) +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln>';
  return (
    beginShape(id, name, props) +
    '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>' +
    String(value)
      .split('\n')
      .map(
        (t) =>
          '<a:p><a:pPr algn="' +
          (opts.center ? 'ctr' : 'l') +
          '"/><a:r><a:rPr lang="en-US" sz="' +
          size * 100 +
          '" b="' +
          (opts.bold ? '1' : '0') +
          '"><a:solidFill><a:srgbClr val="' +
          (opts.color || '312A2C') +
          '"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>' +
          esc(t) +
          '</a:t></a:r></a:p>',
      )
      .join('') +
    '</p:txBody></p:sp>'
  );
}
function circle(id, name, cx, cy, color) {
  return (
    beginShape(
      id,
      name,
      xfrm(cx - 151, cy - 151, 302, 302) +
        '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="' +
        color +
        '"><a:alpha val="23000"/></a:srgbClr></a:solidFill><a:ln w="20000"><a:solidFill><a:srgbClr val="' +
        color +
        '"/></a:solidFill></a:ln>',
    ) + '</p:sp>'
  );
}
function lines(value, limit = 79) {
  const out = [];
  let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (line && line.length + word.length + 1 > limit) {
      out.push(line);
      line = '';
    }
    for (let i = 0; i < word.length; i += limit) {
      const piece = word.slice(i, i + limit);
      if (i && line) {
        out.push(line);
        line = '';
      }
      line += (line ? ' ' : '') + piece;
    }
  }
  if (line) out.push(line);
  return out;
}
function slideXml(shapes) {
  return (
    '<p:sld xmlns:p="' +
    pres +
    '" xmlns:a="' +
    drawing +
    '"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFCF6"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><!---->' +
    shapes.join('') +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}
function intro(report, title) {
  return [
    textBox(
      2,
      'Collection',
      'TEMPLATEATLAS   /   SET COMPARISON',
      62,
      32,
      1156,
      30,
      12,
      { color: colors[0], bold: true },
    ),
    textBox(3, 'Title', title, 62, 70, 1156, 70, 34, { bold: true }),
  ];
}
export function vennPptx(report) {
  const pages = [],
    first = intro(report, 'Venn diagram');
  let id = 4;
  const points = coordinates(report.venn),
    slots = regions(report.venn);
  points.forEach(([x, y], i) =>
    first.push(
      circle(
        id++,
        'Set ' + String.fromCharCode(65 + i) + ': ' + report.setNames[i],
        x,
        y,
        colors[i],
      ),
    ),
  );
  report.regionData.forEach((r, i) =>
    first.push(
      textBox(
        id++,
        'Count in ' + r.label,
        r.members.length,
        slots[i][0] - 41,
        slots[i][1] - 15,
        82,
        36,
        20,
        { bold: true, center: true },
      ),
    ),
  );
  first.push(
    textBox(id++, 'Legend heading', 'Sets', 825, 175, 385, 45, 22, {
      bold: true,
    }),
  );
  report.setNames.forEach((n, i) =>
    first.push(
      textBox(
        id++,
        'Set name ' + (i + 1),
        String.fromCharCode(65 + i) + '   ' + n,
        825,
        241 + i * 80,
        385,
        70,
        19,
        { color: colors[i] },
      ),
    ),
  );
  first.push(
    textBox(
      id++,
      'Diagram key',
      'Numbers count distinct members in each exclusive region. Circle sizes do not represent population.',
      62,
      638,
      1152,
      52,
      17,
    ),
  );
  pages.push(slideXml(first));
  const details = [];
  for (const r of report.regionData) {
    const members = r.members.length ? r.members.join(', ') : 'No members';
    details.push({ label: r.label, lines: lines(members) });
  }
  let body = intro(report, 'Exclusive region members'),
    y = 168;
  id = 4;
  for (const section of details) {
    let offset = 0;
    while (offset < section.lines.length) {
      if (y > 549) {
        pages.push(slideXml(body));
        body = intro(report, 'Exclusive region members');
        id = 4;
        y = 168;
      }
      body.push(
        textBox(
          id++,
          'Region ' + section.label,
          section.label + (offset ? ' (continued)' : ''),
          65,
          y,
          1150,
          33,
          19,
          { bold: true, color: colors[0] },
        ),
      );
      y += 39;
      const portion = section.lines.slice(
        offset,
        offset + Math.max(1, Math.floor((653 - y) / 34)),
      );
      body.push(
        textBox(
          id++,
          'Members',
          portion.join('\n'),
          65,
          y,
          1150,
          portion.length * 34 + 5,
          16,
        ),
      );
      y += portion.length * 34 + 22;
      offset += portion.length;
    }
  }
  pages.push(slideXml(body));
  const pkg = unzipSync(
    Uint8Array.from(atob(emptyPresentation), (s) => s.charCodeAt(0)),
  );
  const content = strFromU8(pkg['[Content_Types].xml']).replace(
    /<Override[^>]*PartName="\/ppt\/slides\/slide1\.xml"[^>]*\/>/,
    '',
  );
  const presRel = strFromU8(pkg['ppt/_rels/presentation.xml.rels']).replace(
    /<Relationship\s[^>]*Type="[^"]*\/slide"[^>]*\/>/,
    '',
  );
  const ids = [],
    newTypes = [],
    newRels = [];
  pages.forEach((p, i) => {
    const n = i + 1,
      slidePath = 'ppt/slides/slide' + n + '.xml';
    pkg[slidePath] = strToU8(p);
    pkg['ppt/slides/_rels/slide' + n + '.xml.rels'] = strToU8(
      '<Relationships xmlns="' +
        rels +
        '"><Relationship Id="rId1" Type="' +
        office +
        '/slideLayout" Target="../slideLayouts/slideLayout6.xml"/></Relationships>',
    );
    ids.push(
      '<p:sldId id="' +
        (256 + i) +
        '" r:id="Venn' +
        n +
        '" xmlns:r="' +
        office +
        '"/>',
    );
    newTypes.push(
      '<Override PartName="/' +
        slidePath +
        '" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>',
    );
    newRels.push(
      '<Relationship Id="Venn' +
        n +
        '" Type="' +
        office +
        '/slide" Target="slides/slide' +
        n +
        '.xml"/>',
    );
  });
  pkg['[Content_Types].xml'] = strToU8(
    content.replace('</Types>', newTypes.join('') + '</Types>'),
  );
  pkg['ppt/presentation.xml'] = strToU8(
    strFromU8(pkg['ppt/presentation.xml']).replace(
      /<p:sldIdLst>.*?<\/p:sldIdLst>/s,
      '<p:sldIdLst>' + ids.join('') + '</p:sldIdLst>',
    ),
  );
  pkg['ppt/_rels/presentation.xml.rels'] = strToU8(
    presRel.replace('</Relationships>', newRels.join('') + '</Relationships>'),
  );
  pkg['docProps/core.xml'] = strToU8(
    strFromU8(pkg['docProps/core.xml'])
      .replaceAll('Walnut Exporter', 'TemplateAtlas')
      .replace('>Presentation<', '>Venn diagram<'),
  );
  return zipSync(pkg, { level: 4 });
}
export function vennSvg(report, detail = true) {
  const slots = regions(report.venn);
  let y = 650;
  const chunks = [];
  if (detail) {
    for (const r of report.regionData) {
      chunks.push(
        '<text x="65" y="' +
          y +
          '" font-size="23" font-weight="bold">' +
          esc(r.label) +
          '</text>',
      );
      y += 33;
      for (const t of lines(r.members.join(', ') || 'No members')) {
        chunks.push(
          '<text x="65" y="' + y + '" font-size="21">' + esc(t) + '</text>',
        );
        y += 30;
      }
      y += 18;
    }
  }
  const h = detail ? Math.max(665, y + 12) : 635;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="' +
    h +
    '" viewBox="0 0 1280 ' +
    h +
    '" role="img" aria-label="Venn diagram with distinct member counts"><rect width="1280" height="' +
    h +
    '" fill="#fffcf6"/><g font-family="Arial,sans-serif" fill="#312a2c"><text x="65" y="66" font-size="33" font-weight="bold">Venn diagram</text>' +
    coordinates(report.venn)
      .map(
        ([x, y], i) =>
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="151" fill="#' +
          colors[i] +
          '" fill-opacity=".23" stroke="#' +
          colors[i] +
          '" stroke-width="2"/>',
      )
      .join('') +
    report.regionData
      .map(
        (r, i) =>
          '<text x="' +
          slots[i][0] +
          '" y="' +
          slots[i][1] +
          '" text-anchor="middle" font-size="28" font-weight="bold">' +
          r.members.length +
          '</text>',
      )
      .join('') +
    report.setNames
      .map((v, i) =>
        lines(String.fromCharCode(65 + i) + '   ' + v, 26)
          .map(
            (s, j) =>
              '<text x="819" y="' +
              (227 + i * 84 + j * 24) +
              '" font-size="20">' +
              esc(s) +
              '</text>',
          )
          .join(''),
      )
      .join('') +
    '<text x="65" y="611" font-size="18">Exclusive counts. Circle sizes do not represent population.</text>' +
    chunks.join('') +
    '</g></svg>'
  );
}
