import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
const styles =
  '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="mmm d, yyyy"/><numFmt numFmtId="165" formatCode="h:mm AM/PM"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
const time = (s) => {
  const [h, m] = s.split(':').map(Number);
  return (h * 60 + m) / 1440;
};
export function scheduleWorkbook(report, buildWorkbook) {
  const rows = [report.columns],
    length = Math.max(report.events.length + 6, 12),
    last = length + 1;
  for (let i = 0; i < length; i++) {
    const v = report.events[i],
      r = i + 2,
      formula =
        'IF(OR(A' +
        r +
        '="",B' +
        r +
        '="",C' +
        r +
        '=""),"",IF(C' +
        r +
        '<=B' +
        r +
        ',"Check time",IF(COUNTIFS(A$2:A$' +
        last +
        ',A' +
        r +
        ',B$2:B$' +
        last +
        ',"<"&C' +
        r +
        ',C$2:C$' +
        last +
        ',">"&B' +
        r +
        ')>1,"Overlap","Clear")))';
    rows.push([
      v ? Date.parse(v.day + 'T00:00:00Z') / 86400000 + 25569 : '',
      v ? time(v.s) : '',
      v ? time(v.e) : '',
      v?.title || '',
      { formula, cache: v ? report.rows[i][4] : '' },
    ]);
  }
  const pkg = unzipSync(buildWorkbook('Schedule', rows));
  let xml = strFromU8(pkg['xl/worksheets/sheet1.xml']).replace(
    /<cols>.*?<\/cols>/,
    '<cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="3" width="14" customWidth="1"/><col min="4" max="4" width="50" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/></cols>',
  );
  xml = xml.replace(/<c r="([ABCE])(\d+)"/g, (original, col, idx) =>
    Number(idx) === 1
      ? original
      : original +
        (col === 'E' ? ' t="str"' : ' s="' + (col === 'A' ? 1 : 2) + '"'),
  );
  pkg['xl/worksheets/sheet1.xml'] = strToU8(xml);
  pkg['xl/styles.xml'] = strToU8(styles);
  pkg['[Content_Types].xml'] = strToU8(
    strFromU8(pkg['[Content_Types].xml']).replace(
      '</Types>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
  );
  pkg['xl/_rels/workbook.xml.rels'] = strToU8(
    strFromU8(pkg['xl/_rels/workbook.xml.rels']).replace(
      '</Relationships>',
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
  );
  return zipSync(pkg, { level: 4 });
}
