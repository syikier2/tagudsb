// utils/bmp.js
// 把灰階點陣編碼成 8-bit BMP 的 base64 字串（純 JavaScript，不需要額外套件）。
// Google Vision 與 React Native 的 <Image> 都支援 BMP。

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

/**
 * @param {Uint8Array} pixels 灰階值（0 = 黑，255 = 白），由上到下、由左到右
 * @param {number} width
 * @param {number} height
 */
export function encodeGrayBmpBase64(pixels, width, height) {
  const rowSize = Math.ceil(width / 4) * 4; // 每列補齊到 4 的倍數
  const paletteSize = 256 * 4;
  const dataOffset = 14 + 40 + paletteSize;
  const fileSize = dataOffset + rowSize * height;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  // BITMAPFILEHEADER
  buf[0] = 0x42; buf[1] = 0x4d; // "BM"
  view.setUint32(2, fileSize, true);
  view.setUint32(10, dataOffset, true);
  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // 正數 = 由下往上存
  view.setUint16(26, 1, true);
  view.setUint16(28, 8, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, rowSize * height, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 256, true);
  // 灰階調色盤
  for (let i = 0; i < 256; i++) {
    const o = 54 + i * 4;
    buf[o] = i; buf[o + 1] = i; buf[o + 2] = i; buf[o + 3] = 0;
  }
  // 像素（由下往上）
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width;
    const dst = dataOffset + y * rowSize;
    buf.set(pixels.subarray(src, src + width), dst);
  }
  return toBase64(buf);
}
