export function rasterSize(bytes) {
  if (
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes.length >= 24
  ) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: 'png', width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw Error('Choose a JPEG or PNG logo.');
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos++] !== 255) break;
    let mark = bytes[pos++];
    while (mark === 255 && pos < bytes.length) mark = bytes[pos++];
    if (mark === 217 || mark === 218) break;
    const n = (bytes[pos] << 8) | bytes[pos + 1];
    if (n < 2 || pos + n > bytes.length) break;
    if ([192, 193, 194].includes(mark) && n >= 8)
      return {
        type: 'jpeg',
        height: (bytes[pos + 3] << 8) | bytes[pos + 4],
        width: (bytes[pos + 5] << 8) | bytes[pos + 6],
      };
    pos += n;
  }
  throw Error('The logo could not be opened as a JPEG or PNG.');
}
