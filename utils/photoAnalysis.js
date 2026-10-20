// utils/photoAnalysis.js
// 拍照模式：在手機上直接分析紙本畫鐘的照片（不需網路、不需 API）。
//
// 流程：
//   1. 解碼 JPEG → 灰階
//   2. 自適應二值化：每個像素和「周圍一小塊的平均亮度」比，比周圍暗夠多才算筆跡
//      （可以消除紙張陰影、光線不均）
//   3. 閉運算：接回原子筆斷斷續續的細線
//   4. 找出每一塊相連的筆跡（連通元件）
//   5. 找出畫的圓圈 → 得到鐘面中心與大小，順便評估輪廓（MoCA 輪廓項）
//   6. 圓圈內的每塊筆跡細化成骨架，判斷有沒有封閉的圈
//   7. 換算成和手繪模式相同的座標，交給同一套分組、辨識、評分模組

import jpeg from 'jpeg-js';
import { encodeGrayBmpBase64 } from './bmp.js';

// ---- 可調整的參數（皆相對於影像寬度） ---------------------------------------
const THRESH_WINDOW_RATIO = 0.055; // 比較亮度的周圍範圍
const WEAK_RATIO = 0.06;           // 寬鬆門檻：比周圍平均暗 6% 以上就「可能是筆跡」（用比例，陰影處也適用）
const STRONG_OF_INK = 0.5;         // 嚴格門檻 =「這張照片裡最深那批筆跡」深度的一半（依照片自動調整，淡色原子筆也適用）
const INK_PERCENTILE = 0.9;        // 「最深那批筆跡」= 所有可能筆跡像素中，深度排在前 10% 的程度
const STRONG_MIN_PIXELS = 4;       // 「夠多」= 至少這麼多個像素（紙張紋理、淡污點達不到）
const CLOSE_RATIO = 0.004;         // 接回斷線的距離
const MIN_AREA_RATIO = 0.02;       // 筆跡面積下限（像素數 ÷ 影像寬度），太小的是雜點
const RING_FILL_MAX = 0.2;         // 圓圈：筆跡只佔外框面積的一小部分（中間是空的）
const RING_MIN_SIZE = 0.35;        // 圓圈至少要有影像短邊的 35% 大
const INSIDE_LIMIT = 0.97;         // 在圓圈內 97% 半徑以內的筆跡才算鐘面上的東西
const CANVAS_RADIUS_RATIO = 0.46;  // 換算成手繪畫布時，圓圈半徑佔畫布的比例（與手繪模式的引導圓相同）

// ---- base64 / JPEG ------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function base64ToBytes(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64_LOOKUP[clean.charCodeAt(i)] << 18) | (B64_LOOKUP[clean.charCodeAt(i + 1)] << 12) |
      (B64_LOOKUP[clean.charCodeAt(i + 2)] << 6) | B64_LOOKUP[clean.charCodeAt(i + 3)];
    if (o < len) out[o++] = (n >> 16) & 255;
    if (o < len) out[o++] = (n >> 8) & 255;
    if (o < len) out[o++] = n & 255;
  }
  return out;
}

/** JPEG（base64）→ { gray: Uint8Array, width, height } */
export function decodeJpegToGray(base64) {
  const { width, height, data } = jpeg.decode(base64ToBytes(base64), { useTArray: true, formatAsRGBA: true });
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
  }
  return { gray, width, height };
}

// ---- 二值化與形態學 ---------------------------------------------------------------

/**
 * 每個像素比周圍暗多少（比例）。用積分影像快速算出每個像素周圍的平均亮度。
 * 回傳 Float32Array：0 = 和周圍一樣亮，0.2 = 比周圍暗 20%
 */
export function localDarkness(gray, W, H, windowSize) {
  const IW = W + 1;
  const integral = new Float64Array(IW * (H + 1));
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    for (let x = 0; x < W; x++) {
      rowSum += gray[y * W + x];
      integral[(y + 1) * IW + x + 1] = integral[y * IW + x + 1] + rowSum;
    }
  }
  const half = windowSize >> 1;
  const dark = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(H, y + half + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(W, x + half + 1);
      const sum = integral[y1 * IW + x1] - integral[y0 * IW + x1] - integral[y1 * IW + x0] + integral[y0 * IW + x0];
      const mean = sum / ((y1 - y0) * (x1 - x0));
      dark[y * W + x] = mean > 0 ? (mean - gray[y * W + x]) / mean : 0;
    }
  }
  return dark;
}

/**
 * 雙門檻二值化：先用寬鬆門檻找出所有「可能是筆跡」的區塊，
 * 再只保留裡面有足夠「很深」像素的區塊。真正的筆畫一定有夠深的部分，紙張紋理與淡污點沒有。
 */
export function hysteresisThreshold(dark, W, H, weak, strongOfInk, strongMinPixels) {
  const cand = new Uint8Array(W * H);
  // 統計可能筆跡像素的深度分布（0~1 分成 200 格），找出「最深那批」的深度
  const hist = new Uint32Array(200);
  let total = 0;
  for (let i = 0; i < cand.length; i++) {
    if (dark[i] > weak) {
      cand[i] = 1;
      hist[Math.min(199, Math.floor(dark[i] * 200))]++;
      total++;
    }
  }
  let acc = 0, inkLevel = weak;
  for (let b = 0; b < 200; b++) {
    acc += hist[b];
    if (acc >= INK_PERCENTILE * total) { inkLevel = (b + 0.5) / 200; break; }
  }
  const strong = Math.max(weak * 1.5, strongOfInk * inkLevel);
  const ink = new Uint8Array(W * H);
  for (const c of connectedComponents(cand, W, H, 1)) {
    let strongCount = 0;
    for (const p of c.pixels) if (dark[p] > strong && ++strongCount >= strongMinPixels) break;
    if (strongCount >= strongMinPixels) for (const p of c.pixels) ink[p] = 1;
  }
  return ink;
}

/** 單一門檻的自適應二值化（保留給測試與比較用） */
export function adaptiveThreshold(gray, W, H, windowSize, ratio) {
  const IW = W + 1;
  const integral = new Float64Array(IW * (H + 1));
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    for (let x = 0; x < W; x++) {
      rowSum += gray[y * W + x];
      integral[(y + 1) * IW + x + 1] = integral[y * IW + x + 1] + rowSum;
    }
  }
  const half = windowSize >> 1;
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(H, y + half + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(W, x + half + 1);
      const sum = integral[y1 * IW + x1] - integral[y0 * IW + x1] - integral[y1 * IW + x0] + integral[y0 * IW + x0];
      const mean = sum / ((y1 - y0) * (x1 - x0));
      if (gray[y * W + x] < mean * (1 - ratio)) ink[y * W + x] = 1;
    }
  }
  return ink;
}

/** 正方形範圍的膨脹（mode = 'dilate'）或侵蝕（'erode'），分成橫向、縱向兩次做 */
function morph(bin, W, H, r, mode) {
  const pass = (src, horizontal) => {
    const dst = new Uint8Array(W * H);
    const len = horizontal ? W : H, lines = horizontal ? H : W;
    for (let l = 0; l < lines; l++) {
      const idx = k => (horizontal ? l * W + k : k * W + l);
      // 前綴和：區間內有幾個 1
      const pre = new Int32Array(len + 1);
      for (let k = 0; k < len; k++) pre[k + 1] = pre[k] + src[idx(k)];
      for (let k = 0; k < len; k++) {
        const a = Math.max(0, k - r), b = Math.min(len, k + r + 1);
        const ones = pre[b] - pre[a];
        dst[idx(k)] = mode === 'dilate' ? (ones > 0 ? 1 : 0) : (ones === b - a ? 1 : 0);
      }
    }
    return dst;
  };
  return pass(pass(bin, true), false);
}

export function closing(bin, W, H, r) {
  if (r < 1) return bin;
  return morph(morph(bin, W, H, r, 'dilate'), W, H, r, 'erode');
}

// ---- 連通元件 -------------------------------------------------------------------

/** 8 方向相連的筆跡分成一塊一塊 */
export function connectedComponents(bin, W, H, minArea) {
  const labels = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start] || labels[start] !== -1) continue;
    const id = comps.length;
    const pixels = [];
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      const px = p % W, py = (p - px) / W;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= W || (dx === 0 && dy === 0)) continue;
          const q = ny * W + nx;
          if (bin[q] && labels[q] === -1) { labels[q] = id; stack.push(q); }
        }
      }
    }
    comps.push({ id, pixels, box: { x0, x1, y0, y1 }, area: pixels.length });
  }
  return comps.filter(c => c.area >= minArea);
}

/** 把一塊筆跡切成獨立的小遮罩（四周留 pad 格空白） */
function componentMask(comp, W, pad) {
  const bw = comp.box.x1 - comp.box.x0 + 1 + 2 * pad;
  const bh = comp.box.y1 - comp.box.y0 + 1 + 2 * pad;
  const mask = new Uint8Array(bw * bh);
  for (const p of comp.pixels) {
    const x = (p % W) - comp.box.x0 + pad, y = Math.floor(p / W) - comp.box.y0 + pad;
    mask[y * bw + x] = 1;
  }
  return { mask, bw, bh, ox: comp.box.x0 - pad, oy: comp.box.y0 - pad };
}

// ---- 骨架（Zhang-Suen 細化法）--------------------------------------------------

export function zhangSuenThin(mask, w, h) {
  const m = mask.slice();
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1];
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
          if (A !== 1) continue;
          if (step === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) {
            del.push(i);
          }
        }
      }
      if (del.length) {
        changed = true;
        for (const i of del) m[i] = 0;
      }
    }
  }
  return m;
}

// ---- 封閉的圈 ----------------------------------------------------------------------

/**
 * 筆跡裡有沒有封閉的圈（例如 6、8、9、0）：
 * 先把小缺口補起來，再從四周往內填滿背景，填不到的空白就是被圍起來的圈。
 */
function hasHole(comp, W) {
  const h = comp.box.y1 - comp.box.y0 + 1;
  const r = Math.max(1, Math.round(0.05 * h));
  const { mask, bw, bh } = componentMask(comp, W, r + 2);
  const closed = closing(mask, bw, bh, r);
  const seen = new Uint8Array(bw * bh);
  const stack = [];
  for (let x = 0; x < bw; x++) { stack.push(x, (bh - 1) * bw + x); }
  for (let y = 0; y < bh; y++) { stack.push(y * bw, y * bw + bw - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || closed[p]) continue;
    seen[p] = 1;
    const x = p % bw, y = (p - x) / bw;
    if (x > 0) stack.push(p - 1);
    if (x < bw - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - bw);
    if (y < bh - 1) stack.push(p + bw);
  }
  const minHole = Math.max(4, (0.06 * h) ** 2);
  let holeArea = 0;
  for (let i = 0; i < closed.length; i++) if (!closed[i] && !seen[i]) holeArea++;
  return holeArea >= minHole;
}

// ---- 圓圈（鐘面輪廓）--------------------------------------------------------------

function findRing(comps, W, H) {
  let best = null, bestSize = 0;
  for (const c of comps) {
    const bw = c.box.x1 - c.box.x0 + 1, bh = c.box.y1 - c.box.y0 + 1;
    const fill = c.area / (bw * bh);
    const size = Math.max(bw, bh);
    if (fill < RING_FILL_MAX && size >= RING_MIN_SIZE * Math.min(W, H) && size > bestSize) {
      best = c; bestSize = size;
    }
  }
  return best;
}

/**
 * 碰到圓圈的數字會和圓圈連成同一塊。圓圈一定是每個方向上最外圈的筆跡，
 * 所以在每個角度，比最外圈明顯靠內的像素就不屬於圓圈，把它們分出來當成獨立的筆跡。
 * @returns 分出來的新筆跡塊（ring.pixels 會被更新成只剩圓圈本身）
 */
function detachFromRing(ring, W, H, cx, cy, rx, ry, minArea) {
  const BINS = 180;
  const info = ring.pixels.map(p => {
    const x = p % W, y = Math.floor(p / W);
    const u = (x - cx) / rx, v = (y - cy) / ry;
    let a = Math.atan2(u, -v);
    if (a < 0) a += 2 * Math.PI;
    return { p, r: Math.hypot(u, v), b: Math.min(BINS - 1, Math.floor((a / (2 * Math.PI)) * BINS)) };
  });
  const maxR = new Float32Array(BINS).fill(-1);
  for (const it of info) if (it.r > maxR[it.b]) maxR[it.b] = it.r;
  // 每個角度的最外圈半徑，取前後幾格的中位數，避免單一格的雜訊
  const outer = new Float32Array(BINS);
  for (let b = 0; b < BINS; b++) {
    const vals = [];
    for (let k = -3; k <= 3; k++) { const m = maxR[(b + k + BINS) % BINS]; if (m > 0) vals.push(m); }
    vals.sort((a, c) => a - c);
    outer[b] = vals.length ? vals[vals.length >> 1] : 1;
  }
  const strokeW = ring.area / (Math.PI * (rx + ry)); // 筆跡粗細估計
  const band = (3 * strokeW) / Math.min(rx, ry);
  const keep = [], loose = new Uint8Array(W * H);
  let looseCount = 0;
  for (const it of info) {
    if (it.r >= outer[it.b] - band) keep.push(it.p);
    else { loose[it.p] = 1; looseCount++; }
  }
  if (!looseCount) return [];
  ring.pixels = keep;
  ring.area = keep.length;
  // 分出來的部分：又細又沿著圓圈走的（例如圓圈描了兩次的內側那條）仍算圓圈的一部分，不當成數字
  const out = [];
  for (const c of connectedComponents(loose, W, H, minArea)) {
    let rMin = Infinity, rMax = -Infinity;
    for (const p of c.pixels) {
      const r = Math.hypot((p % W - cx) / rx, (Math.floor(p / W) - cy) / ry);
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
    if (rMax - rMin >= 0.05) out.push(c);
  }
  return out;
}

/** MoCA 輪廓：是一個圓、只有輕微變形、而且有畫完整（封閉） */
function assessContour(ring, W) {
  const { x0, x1, y0, y1 } = ring.box;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const aspect = Math.min(rx, ry) / Math.max(rx, ry);
  const bins = new Uint8Array(36);
  for (const p of ring.pixels) {
    const x = p % W, y = Math.floor(p / W);
    let a = (Math.atan2((x - cx) / rx, (cy - y) / ry) * 180) / Math.PI;
    if (a < 0) a += 360;
    bins[Math.min(35, Math.floor(a / 10))] = 1;
  }
  const coverage = bins.reduce((s, b) => s + b, 0) / 36;
  const pass = aspect >= 0.75 && coverage >= 0.9;
  const messages = [];
  if (aspect < 0.75) messages.push('圓圈變形比較明顯（太扁）。');
  if (coverage < 0.9) messages.push('圓圈沒有畫完整。');
  if (pass) messages.push('有畫出完整的圓形鐘面。');
  return { found: true, pass, aspect, coverage, messages };
}

// ---- 主流程 --------------------------------------------------------------------------

/**
 * 分析一張畫鐘照片
 * @param {string} base64 JPEG 的 base64（建議先縮到寬約 1000px）
 * @returns {{
 *   strokes: Array,      // 和手繪模式相同座標系的「筆畫」（點沒有順序，附 loop）
 *   canvas: {width, height},
 *   contour: object,     // 輪廓評估
 *   binaryPreview: {base64, width, height}, // 偵錯用：黑白圖
 * }}
 */
export function analyzePhoto(base64, options = {}) {
  const {
    weak = WEAK_RATIO, strongOfInk = STRONG_OF_INK, strongMinPixels = STRONG_MIN_PIXELS,
  } = options;
  const { gray, width: W, height: H } = decodeJpegToGray(base64);
  const win = Math.max(9, Math.round(W * THRESH_WINDOW_RATIO)) | 1;
  const dark = localDarkness(gray, W, H, win);
  let ink = hysteresisThreshold(dark, W, H, weak, strongOfInk, strongMinPixels);
  ink = closing(ink, W, H, Math.max(1, Math.round(W * CLOSE_RATIO)));

  const minArea = Math.max(8, W * MIN_AREA_RATIO);
  const comps = connectedComponents(ink, W, H, minArea);
  const ring = findRing(comps, W, H);

  // 鐘面中心與大小：有圓圈就用圓圈的外框；沒有就用所有筆跡的範圍
  let cx, cy, rx, ry, contour;
  if (ring) {
    cx = (ring.box.x0 + ring.box.x1) / 2; cy = (ring.box.y0 + ring.box.y1) / 2;
    rx = (ring.box.x1 - ring.box.x0) / 2; ry = (ring.box.y1 - ring.box.y0) / 2;
    comps.push(...detachFromRing(ring, W, H, cx, cy, rx, ry, minArea)); // 碰到圓圈的數字分出來
    contour = assessContour(ring, W);
  } else {
    const xs = comps.flatMap(c => [c.box.x0, c.box.x1]), ys = comps.flatMap(c => [c.box.y0, c.box.y1]);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    rx = ((Math.max(...xs) - Math.min(...xs)) / 2) * 1.1; ry = ((Math.max(...ys) - Math.min(...ys)) / 2) * 1.1;
    contour = { found: false, pass: false, messages: ['沒有找到圓形的鐘面輪廓。'] };
  }

  // 換算成手繪畫布的座標：橢圓拉回正圓（修正拍照角度造成的變形），圓心在畫布正中央
  const S = ry / CANVAS_RADIUS_RATIO;
  const toCanvas = (x, y) => ({ x: S / 2 + (x - cx) * (ry / rx), y: S / 2 + (y - cy) });

  const strokes = [];
  for (const c of comps) {
    if (c === ring) continue;
    const mx = (c.box.x0 + c.box.x1) / 2, my = (c.box.y0 + c.box.y1) / 2;
    if (Math.hypot((mx - cx) / rx, (my - cy) / ry) > INSIDE_LIMIT) continue; // 圓圈外：桌面、紙張邊緣
    const { mask, bw, bh, ox, oy } = componentMask(c, W, 1);
    const skel = zhangSuenThin(mask, bw, bh);
    const points = [];
    for (let i = 0; i < skel.length; i++) {
      if (skel[i]) points.push(toCanvas((i % bw) + ox, Math.floor(i / bw) + oy));
    }
    if (points.length) strokes.push({ points, loop: hasHole(c, W), unordered: true });
  }

  // 偵錯用：縮小的黑白圖
  const step = Math.max(1, Math.ceil(W / 400));
  const pw = Math.floor(W / step), ph = Math.floor(H / step);
  const preview = new Uint8Array(pw * ph).fill(255);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (ink[y * step * W + x * step]) preview[y * pw + x] = 0;
  if (ring) for (const p of ring.pixels) {
    const x = Math.floor((p % W) / step), y = Math.floor(Math.floor(p / W) / step);
    if (x < pw && y < ph) preview[y * pw + x] = 160; // 圓圈用灰色標示
  }

  return {
    strokes,
    canvas: { width: S, height: S },
    contour,
    binaryPreview: { base64: encodeGrayBmpBase64(preview, pw, ph), width: pw, height: ph },
  };
}
