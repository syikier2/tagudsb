// utils/drawingRender.js
// 把保存的手繪筆跡畫成圖片（BMP），人工評分時顯示。純 JavaScript，手機和網頁都能用。
import { encodeGrayBmpBase64 } from './bmp.js';
import { stampLine } from './strokeClusters.js';

export function renderDrawing(drawing, size = 320) {
  const S = size;
  const pixels = new Uint8Array(S * S).fill(255);
  const scale = S / Math.max(drawing.width, drawing.height, 1);
  // 淡灰色引導圓圈（和作答時畫面上的一樣，只是參考位置）
  const cx = (drawing.width * scale) / 2, cy = (drawing.height * scale) / 2, r = cx - 12 * scale;
  for (let a = 0; a < 720; a++) {
    const t = (a / 720) * Math.PI * 2;
    const x = Math.round(cx + r * Math.cos(t)), y = Math.round(cy + r * Math.sin(t));
    if (x >= 0 && x < S && y >= 0 && y < S) pixels[y * S + x] = Math.min(pixels[y * S + x], 205);
  }
  const pen = Math.max(1.5, 2.2 * scale);
  for (const s of drawing.strokes) {
    const pts = s.map(([x, y]) => [x * scale, y * scale]);
    if (pts.length === 1) stampLine(pixels, S, S, pts[0][0], pts[0][1], pts[0][0], pts[0][1], pen);
    for (let k = 1; k < pts.length; k++) stampLine(pixels, S, S, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], pen);
  }
  return encodeGrayBmpBase64(pixels, S, S);
}
