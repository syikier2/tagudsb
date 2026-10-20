// tests/helpers.mjs
// 測試共用工具：產生模擬筆畫、把截圖擷取的骨架像素轉成點雲。

/** 從一堆（沒有順序的）像素點中，平均挑出 n 個點（最遠點取樣） */
export function farthestPointSample(pts, n) {
  const out = [pts[0]];
  const d = pts.map(() => Infinity);
  while (out.length < n) {
    const last = out[out.length - 1];
    let bi = 0, bd = -1;
    pts.forEach((p, i) => {
      d[i] = Math.min(d[i], Math.hypot(p[0] - last[0], p[1] - last[1]));
      if (d[i] > bd) { bd = d[i]; bi = i; }
    });
    out.push(pts[bi]);
  }
  return out;
}

/** 把一條折線加密成很多點（模擬手指畫出的連續筆跡），附上時間戳記 */
export function densify(polyline, { scale = 1, ox = 0, oy = 0, t0 = 0, msPerPoint = 10 } = {}) {
  const out = [];
  let t = t0;
  for (let i = 1; i < polyline.length; i++) {
    const [ax, ay] = polyline[i - 1], [bx, by] = polyline[i];
    for (let k = 0; k < 10; k++) {
      out.push({ x: ox + (ax + ((bx - ax) * k) / 10) * scale, y: oy + (ay + ((by - ay) * k) / 10) * scale, time: t });
      t += msPerPoint;
    }
  }
  const [lx, ly] = polyline[polyline.length - 1];
  out.push({ x: ox + lx * scale, y: oy + ly * scale, time: t });
  return out;
}

// 標準寫法的數字（寬 0.6、高 1，y 軸向下）
export const GLYPHS = {
  0: [[[0.3, 0], [0, 0.25], [0, 0.75], [0.3, 1], [0.6, 0.75], [0.6, 0.25], [0.3, 0]]],
  1: [[[0.2, 0.15], [0.35, 0], [0.35, 1]]],
  2: [[[0, 0.2], [0.3, 0], [0.6, 0.2], [0.6, 0.4], [0, 1], [0.6, 1]]],
  3: [[[0, 0], [0.6, 0], [0.3, 0.45], [0.6, 0.7], [0.3, 1], [0, 0.85]]],
  4: [[[0.45, 1], [0.45, 0], [0, 0.65], [0.6, 0.65]]],
  5: [[[0.6, 0], [0, 0], [0, 0.45], [0.45, 0.45], [0.6, 0.7], [0.4, 1], [0, 0.9]]],
  6: [[[0.5, 0], [0, 0.6], [0.1, 1], [0.5, 1], [0.6, 0.7], [0.3, 0.5], [0, 0.65]]],
  7: [[[0, 0], [0.6, 0], [0.2, 1]]],
  8: [[[0.3, 0.5], [0, 0.25], [0.3, 0], [0.6, 0.25], [0.3, 0.5], [0, 0.75], [0.3, 1], [0.6, 0.75], [0.3, 0.5]]],
  9: [[[0.6, 0.35], [0.3, 0.5], [0, 0.3], [0.3, 0], [0.6, 0.3], [0.6, 1]]],
};

/** 在 (x, y) 位置寫一個數字字串（例如 "12"），h = 字高；回傳畫布格式的筆畫 */
export function writeNumber(str, x, y, h, t0 = 0) {
  const strokes = [];
  const w = 0.6 * h, gap = 0.12 * h;
  let ox = x - (str.length * w + (str.length - 1) * gap) / 2;
  let t = t0;
  for (const ch of str) {
    for (const pl of GLYPHS[ch]) {
      const points = densify(pl, { scale: h, ox, oy: y - h / 2, t0: t });
      strokes.push({ points });
      t = points[points.length - 1].time + 300;
    }
    ox += w + gap;
  }
  return strokes;
}

/** 一個完整的鐘：12 個數字放在正確位置（可指定要略過、或要放錯位置的數字） */
export function buildClock(size = 330, { skip = [], moveTo = {} } = {}) {
  const c = size / 2, R = 0.38 * size, h = 0.12 * size;
  const strokes = [];
  for (let n = 1; n <= 12; n++) {
    if (skip.includes(n)) continue;
    const slot = moveTo[n] ?? n;
    const a = (slot * 30 * Math.PI) / 180;
    strokes.push(...writeNumber(String(n), c + R * Math.sin(a), c - R * Math.cos(a), h, n * 2000));
  }
  return strokes;
}

/** 從圓心往某個角度畫一根指針 */
export function drawHand(size, angleDeg, length, t0 = 100000) {
  const c = size / 2, a = (angleDeg * Math.PI) / 180;
  return { points: densify([[c, c], [c + length * Math.sin(a), c - length * Math.cos(a)]], { t0 }) };
}
