// Raster logos are kept in the private invoice revision. Never fetch a supplied URL.
import { rasterSize } from '../lib/raster.mjs';
export function invoiceLogo(value) {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.length > 16408 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw Error('Choose a supported invoice logo.');
  let bytes;
  try {
    bytes = Uint8Array.from(atob(value.slice(23)), (c) => c.charCodeAt(0));
  } catch {
    throw Error('The invoice logo could not be read.');
  }
  const { width, height, type } = rasterSize(bytes);
  if (
    type !== 'jpeg' ||
    !width ||
    !height ||
    width > 320 ||
    height > 100 ||
    bytes.length > 12288 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw Error('Use a compact JPEG logo up to 320 × 100 pixels.');
  return { bytes, width, height };
}
export async function prepareLogo(file) {
  if (!file || file.size > 4000000)
    throw Error('Choose a PNG or JPEG smaller than 4 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer()),
    source = rasterSize(bytes);
  if (!source.width || !source.height || source.width * source.height > 8000000)
    throw Error('Choose a logo with fewer than 8 million pixels.');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 320 / image.width, 100 / image.height),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.89, 0.73, 0.55, 0.4]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= 16408) {
        invoiceLogo(result);
        return result;
      }
    }
    throw Error('Use a simpler or smaller logo.');
  } finally {
    image.close();
  }
}
export function embedWorkbookLogo(files, logo, strToU8) {
  const ns =
      'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    a = 'http://schemas.openxmlformats.org/drawingml/2006/main',
    r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const fit = Math.min(112 / logo.width, 43 / logo.height, 1);
  const cx = Math.round(logo.width * fit * 9525),
    cy = Math.round(logo.height * fit * 9525);
  files['[Content_Types].xml'] = files['[Content_Types].xml'].replace(
    '</Types>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
  );
  files['xl/worksheets/sheet1.xml'] = files['xl/worksheets/sheet1.xml'].replace(
    '</worksheet>',
    '<drawing xmlns:r="' + r + '" r:id="rIdLogo"/></worksheet>',
  );
  files['xl/worksheets/_rels/sheet1.xml.rels'] =
    '<Relationships xmlns="' +
    rels +
    '"><Relationship Id="rIdLogo" Type="' +
    r +
    '/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
  files['xl/drawings/_rels/drawing1.xml.rels'] =
    '<Relationships xmlns="' +
    rels +
    '"><Relationship Id="rIdImage" Type="' +
    r +
    '/image" Target="../media/company-logo.jpeg"/></Relationships>';
  files['xl/drawings/drawing1.xml'] =
    '<xdr:wsDr xmlns:xdr="' +
    ns +
    '" xmlns:a="' +
    a +
    '" xmlns:r="' +
    r +
    '"><xdr:oneCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="' +
    cx +
    '" cy="' +
    cy +
    '"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Business logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' +
    cx +
    '" cy="' +
    cy +
    '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
  return {
    ...Object.fromEntries(
      Object.entries(files).map(([k, s]) => [k, strToU8(s)]),
    ),
    'xl/media/company-logo.jpeg': logo.bytes,
  };
}
