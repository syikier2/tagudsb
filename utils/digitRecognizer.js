// utils/digitRecognizer.js
// 在手機上直接辨識手寫數字（不需網路、不需 API 金鑰）。
//
// 使用 $P 點雲辨識法（$P Point-Cloud Recognizer, Vatavu, Anthony & Wobbrock, ICMI 2012）：
//   1. 把一個字的所有筆畫，沿著筆跡平均取樣成 N 個點（一團「點雲」）
//   2. 縮放到相同大小、移到同一個中心
//   3. 和每個數字範本比對：兩團點雲互相配對，距離總和越小越像
// 這個方法不在乎筆畫順序和方向，也支援多筆畫的字（例如分兩筆寫的 4）。
//
// 一組筆畫可能包含兩個字（例如 10、11、12），會先依左右位置切成單一字元再辨識。

const N = 32; // 每個字取樣的點數

// ---- 幾何工具 -------------------------------------------------------------

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) d += dist(points[i - 1], points[i]);
  }
  return d;
}

/** 沿著筆跡平均取樣成 n 個點（$P 的 resample） */
function resample(points, n) {
  const I = pathLength(points) / (n - 1);
  if (!(I > 0)) {
    // 只有一個點（點一下）：全部疊在同一處
    return Array.from({ length: n }, () => ({ ...points[0] }));
  }
  const pts = points.map(p => ({ ...p }));
  const out = [{ ...pts[0] }];
  let D = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].id === pts[i - 1].id) {
      const d = dist(pts[i - 1], pts[i]);
      if (D + d >= I && d > 0) {
        const t = (I - D) / d;
        const q = {
          x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
          y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
          id: pts[i].id,
        };
        out.push(q);
        pts.splice(i, 0, q);
        D = 0;
      } else {
        D += d;
      }
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

/** 等比例縮放到 0~1，並把重心移到原點（保留長寬比，所以 1 不會被拉寬） */
function normalize(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  const scaled = points.map(p => ({ x: (p.x - x0) / size, y: (p.y - y0) / size, id: p.id }));
  const cx = scaled.reduce((s, p) => s + p.x, 0) / scaled.length;
  const cy = scaled.reduce((s, p) => s + p.y, 0) / scaled.length;
  return scaled.map(p => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

function cloudDistance(a, b, start) {
  const n = a.length;
  const matched = new Array(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity, index = -1;
    for (let j = 0; j < n; j++) {
      if (!matched[j]) {
        const d = dist(a[i], b[j]);
        if (d < min) { min = d; index = j; }
      }
    }
    matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

function greedyCloudMatch(points, template) {
  const n = points.length;
  const step = Math.floor(Math.pow(n, 0.5));
  let min = Infinity;
  for (let i = 0; i < n; i += step) {
    const d1 = cloudDistance(points, template, i);
    const d2 = cloudDistance(template, points, i);
    min = Math.min(min, d1, d2);
  }
  return min;
}

/** 已取樣好的點 → 正規化點雲（測試用） */
export function normalizeCloud(points) {
  return normalize(points);
}

/** 筆畫陣列 [{points:[{x,y}]}] → 正規化後的點雲 */
export function strokesToCloud(strokes) {
  const pts = [];
  strokes.forEach((s, id) => s.points.forEach(p => pts.push({ x: p.x, y: p.y, id })));
  return normalize(resample(pts, N));
}

// ---- 數字範本 ---------------------------------------------------------------
// 座標：寬約 0.6、高 1，y 軸向下。每個數字有好幾種常見寫法。

function arc(cx, cy, rx, ry, fromDeg, toDeg, steps = 16) {
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * k) / steps) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** 標記只用在手繪（有筆順）的範本 */
const ORDERED_ONLY = strokes => Object.assign(strokes, { orderedOnly: true });

const TEMPLATE_STROKES = {
  0: [
    [arc(0.3, 0.5, 0.3, 0.5, -90, 270)],
    [arc(0.3, 0.5, 0.2, 0.5, -90, 270)],
    [arc(0.3, 0.5, 0.38, 0.5, -90, 270)],
  ],
  1: [
    [[[0.3, 0], [0.3, 1]]],
    [[[0.12, 0.2], [0.32, 0], [0.32, 1]]],
    [[[0.42, 0], [0.2, 1]]],
    [[[0.5, 0], [0.12, 1]]],
    [[[0.12, 0.2], [0.35, 0], [0.35, 1]], [[0.1, 1], [0.6, 1]]],
  ],
  2: [
    [[...arc(0.3, 0.28, 0.28, 0.28, 200, 400), [0, 1], [0.6, 1]]],
    [[...arc(0.3, 0.25, 0.3, 0.25, 190, 380), [0.05, 0.95], [0.65, 1]]],
    [[...arc(0.3, 0.3, 0.3, 0.3, 210, 420), [0.02, 1], [0.75, 1]]],
    // 底線拉很長的 2（寬度比高度大）
    [[[0.1, 0.1], [0.3, 0], [0.5, 0.05], [0.6, 0.25], [0.5, 0.5], [0.25, 0.7], [0, 0.8], [0.3, 0.82], [1.0, 0.85]]],
    [[...arc(0.35, 0.3, 0.25, 0.3, 220, 420), [0, 0.82], [1.1, 0.85]]],
    // 上面小小一勾、底線很長而且往右上斜的 2（寬度約為高度的 1.5 倍）
    [[[0.05, 0.2], [0.25, 0.02], [0.45, 0.05], [0.5, 0.25], [0.3, 0.55], [0.08, 0.85], [0.15, 0.88], [0.6, 0.8], [1.5, 0.65]]],
  ],
  3: [
    [[...arc(0.28, 0.25, 0.27, 0.25, 200, 450), ...arc(0.28, 0.73, 0.3, 0.27, 270, 520)]],
    [[[0, 0], [0.6, 0], [0.25, 0.42], ...arc(0.28, 0.7, 0.3, 0.3, 250, 520)]],
    [[...arc(0.3, 0.24, 0.25, 0.24, 210, 450), ...arc(0.3, 0.72, 0.3, 0.28, 270, 500)]],
    // 中間一橫拉得很長、往左畫出去再折回來的 3（志願者樣本 2026-10）
    // （只用在手繪：照片骨架沒有「折回來」的筆順資訊，用了反而會把照片裡的 8 認成 3）
    ORDERED_ONLY([[[0.1, 0.02], [0.4, 0], [0.58, 0.08], [0.6, 0.22], [0.5, 0.36], [0.3, 0.44], [0, 0.46], [0.3, 0.46], [0.52, 0.52], [0.6, 0.68], [0.55, 0.88], [0.35, 1], [0.1, 1], [0.02, 0.94]]]),
    // 同上，但上面是平的
    ORDERED_ONLY([[[0, 0], [0.5, 0], [0.6, 0.08], [0.58, 0.25], [0.45, 0.42], [0.05, 0.48], [0.45, 0.5], [0.6, 0.62], [0.6, 0.85], [0.5, 0.98], [0, 1]]]),
  ],
  4: [
    [[[0.42, 0], [0, 0.65], [0.6, 0.65]], [[0.45, 0.25], [0.45, 1]]],
    [[[0.05, 0], [0, 0.6], [0.6, 0.6]], [[0.45, 0.2], [0.45, 1]]],
    [[[0.45, 1], [0.45, 0], [0, 0.65], [0.6, 0.65]]],
    [[[0.1, 0], [0.05, 0.55], [0.65, 0.5]], [[0.5, 0.1], [0.45, 1]]],
    // 左邊帶弧度的 4
    [[[0.08, 0.05], [0, 0.4], [0.1, 0.65], [0.35, 0.68], [0.7, 0.6]], [[0.4, 0], [0.4, 1]]],
  ],
  5: [
    [[[0.55, 0], [0.08, 0], [0.05, 0.45], ...arc(0.3, 0.7, 0.3, 0.28, 230, 490)]],
    [[[0.05, 0], [0.05, 0.45], ...arc(0.3, 0.7, 0.3, 0.28, 230, 490)], [[0.05, 0], [0.55, 0]]],
    [[[0.6, 0], [0.1, 0.05], [0.05, 0.4], ...arc(0.32, 0.68, 0.3, 0.3, 225, 480)]],
    // 上面短橫斜斜的、下半部大彎的 5
    [[[0.65, 0], [0.3, 0.05], [0.15, 0.2], [0.12, 0.4], [0.35, 0.55], [0.55, 0.75], [0.5, 0.95], [0.3, 1], [0, 0.9]]],
    // 上面那一橫很長、往右上斜的 5
    [[[0.9, 0], [0.35, 0.12], [0.25, 0.45], [0.55, 0.55], [0.7, 0.75], [0.55, 0.95], [0.3, 1], [0.05, 0.9]]],
    // 上面一橫很長、下面身體很窄（像「>」）的 5
    [[[0.85, 0], [0.35, 0.03], [0.05, 0.08], [0, 0.35], [0.1, 0.42], [0.3, 0.55], [0.35, 0.68], [0.25, 0.82], [0.05, 0.95], [0, 1]]],
    // 上面是圓弧、整體像 S 的 5
    [[[0.65, 0.02], [0.35, 0.05], [0.12, 0.2], [0.08, 0.35], [0.2, 0.5], [0.45, 0.65], [0.55, 0.85], [0.45, 1], [0.25, 0.98], [0, 0.95]]],
  ],
  6: [
    [[[0.5, 0], [0.12, 0.38], ...arc(0.3, 0.7, 0.3, 0.3, 180, 540)]],
    [[[0.45, 0], [0.05, 0.6], ...arc(0.3, 0.72, 0.28, 0.28, 180, 540)]],
    [[...arc(0.55, 0.55, 0.55, 0.55, 260, 180, 8), ...arc(0.3, 0.72, 0.28, 0.28, 180, 540)]],
    // 上面是直直一豎、下面小圈的 6
    [[[0.2, 0], [0.12, 0.35], [0.08, 0.7], ...arc(0.3, 0.78, 0.22, 0.22, 180, 540)]],
    [[[0.15, 0], [0.1, 0.5], ...arc(0.3, 0.75, 0.25, 0.25, 170, 530)]],
  ],
  7: [
    [[[0, 0], [0.6, 0], [0.2, 1]]],
    [[[0, 0.05], [0.6, 0], [0.32, 1]]],
    [[[0, 0], [0.6, 0], [0.25, 1]], [[0.15, 0.5], [0.55, 0.5]]],
    [[[0.02, 0.15], [0.05, 0], [0.6, 0], [0.4, 0.5], [0.3, 1]]],
    // 左上角先往下勾一下、轉角圓圓的 7
    [[[0.05, 0.3], [0.05, 0.05], [0.2, 0], [0.5, 0.02], [0.6, 0.15], [0.55, 0.5], [0.5, 1]]],
    // 窄窄的、上面只有短短一勾的 7
    [[[0, 0.25], [0.05, 0.08], [0.15, 0], [0.4, 0.02], [0.45, 0.2], [0.38, 0.6], [0.3, 1]]],
    [[[0.02, 0.18], [0.12, 0.02], [0.38, 0], [0.4, 0.3], [0.32, 1]]],
  ],
  8: [
    [[...arc(0.3, 0.25, 0.22, 0.25, 90, 450), ...arc(0.3, 0.74, 0.28, 0.26, 270, 630)]],
    [[...arc(0.3, 0.26, 0.25, 0.26, 90, 450), ...arc(0.3, 0.74, 0.25, 0.26, 270, 630)]],
    // 一筆寫成「S 再折回去」的 8
    [[[0.55, 0.1], [0.3, 0], [0.08, 0.15], [0.15, 0.35], [0.5, 0.6], [0.6, 0.8], [0.4, 1], [0.1, 0.95], [0.05, 0.75], [0.3, 0.5], [0.55, 0.25]]],
  ],
  9: [
    [[...arc(0.3, 0.3, 0.28, 0.3, 0, 360), [0.58, 0.3], [0.55, 1]]],
    [[...arc(0.3, 0.3, 0.28, 0.3, 0, 360), [0.58, 0.35], [0.45, 0.8], [0.3, 1]]],
    [[...arc(0.3, 0.28, 0.3, 0.28, 0, 360)], [[0.6, 0.15], [0.6, 1]]],
    [[...arc(0.28, 0.25, 0.28, 0.25, 0, 360), [0.56, 0.25], [0.5, 1]]],
    // 上面的圈又小又扁的 9
    [[...arc(0.27, 0.16, 0.24, 0.16, 0, 360), [0.51, 0.16], [0.42, 1]]],
  ],
};

const TEMPLATES = [];
for (const [digit, variants] of Object.entries(TEMPLATE_STROKES)) {
  for (const strokes of variants) {
    TEMPLATES.push({
      digit,
      orderedOnly: Boolean(strokes.orderedOnly),
      cloud: strokesToCloud(strokes.map(s => ({ points: s.map(([x, y]) => ({ x, y })) }))),
    });
  }
}

// 可信度門檻（以使用者實際筆跡調整過）
const MAX_CONFIDENT_DISTANCE = 4.5;
const MIN_MARGIN_RATIO = 1.15; // 第二像的數字距離至少要比最像的大 15%

// 有封閉圈圈的數字 vs. 沒有圈圈的數字。形狀很像的時候（例如帶勾的 7 和小圈的 9），用「有沒有圈」來決定
const LOOPED = new Set(['0', '6', '8', '9']);
const NO_LOOP = new Set(['1', '3', '5', '7']);
const LOOP_TIEBREAK_RATIO = 1.6; // 前兩名的距離比在這以內，才用圈圈判斷

/**
 * 辨識一個字元的點雲
 * @param {Array} cloud strokesToCloud 的結果
 * @param {boolean|null} hasLoop 這個字有沒有封閉的圈（null = 不知道，不使用）
 * @returns {{ digit, distance, second, secondDistance, confident, byLoop }}
 */
export function classifyCloud(cloud, hasLoop = null, { unordered = false } = {}) {
  const best = new Map(); // 每個數字取最接近的範本
  for (const t of TEMPLATES) {
    if (unordered && t.orderedOnly) continue;
    const d = greedyCloudMatch(cloud, t.cloud);
    if (!best.has(t.digit) || d < best.get(t.digit)) best.set(t.digit, d);
  }
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
  let [digit, distance] = ranked[0];
  let [second, secondDistance] = ranked[1];
  let byLoop = false;

  if (hasLoop !== null && secondDistance / distance < LOOP_TIEBREAK_RATIO) {
    // 沒有圈時，4 也算「沒有圈的數字」（開口的 4）；有圈時不算，因為有人會把 4 寫成封閉的三角形
    const swap =
      (!hasLoop && LOOPED.has(digit) && (NO_LOOP.has(second) || second === '4')) ||
      (hasLoop && NO_LOOP.has(digit) && LOOPED.has(second));
    if (swap) {
      [digit, second] = [second, digit];
      [distance, secondDistance] = [secondDistance, distance];
      byLoop = true;
    }
  }
  const confident = !byLoop && distance <= MAX_CONFIDENT_DISTANCE && secondDistance / distance >= MIN_MARGIN_RATIO;
  return { digit, distance, second, secondDistance, confident, byLoop };
}

/**
 * 判斷筆畫有沒有封閉的圈：同一筆畫中，沿著筆跡走了一段距離後又回到很靠近之前經過的地方
 * （例如 9 上面的圈、6 下面的圈）。帶勾的 7、斜斜的 1 都不會有。
 */
const MIN_LOOP_AREA = 0.03; // 圈圍出的面積至少要（字高²）的 3%

/** pts[i..j] 這段路徑（首尾相連）圍出的面積（鞋帶公式） */
function enclosedArea(pts, i, j) {
  let a = 0;
  for (let k = i; k < j; k++) a += pts[k].x * pts[k + 1].y - pts[k + 1].x * pts[k].y;
  a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return Math.abs(a) / 2;
}

export function hasClosedLoop(strokes) {
  let y0 = Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s.points) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const h = Math.max(1, y1 - y0);
  const near = 0.12 * h;
  for (const s of strokes) {
    // 沿筆跡每隔一小段取一個點，並記錄走過的路徑長度
    const pts = [];
    let acc = 0;
    for (let i = 0; i < s.points.length; i++) {
      if (i > 0) acc += dist(s.points[i - 1], s.points[i]);
      if (!pts.length || acc - pts[pts.length - 1].d >= 0.03 * h) pts.push({ x: s.points[i].x, y: s.points[i].y, d: acc });
    }
    const minGap = Math.max(0.3 * acc, 0.6 * h); // 至少要繞一段路才算圈
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        // 繞回來的這一段還要「圍出一塊面積」才算圈；沿著同一條線畫出去又折回來（例如 3 中間的一橫）面積接近 0
        if (pts[j].d - pts[i].d >= minGap && dist(pts[i], pts[j]) < near && enclosedArea(pts, i, j) >= MIN_LOOP_AREA * h * h) return true;
      }
    }
  }
  return false;
}

function strokeBox(s) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of s.points) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}

/**
 * 把一組筆畫依左右位置切成單一字元：左右範圍重疊較多的筆畫屬於同一個字（例如 4 的兩筆），
 * 左右分開的筆畫是不同的字（例如 10 的 1 和 0）
 */
const SHORT_PART_MAX_GAP = 0.12; // 矮的封閉圈和旁邊相隔超過字高的 12%，就當成獨立的字

export function segmentCharacters(strokes) {
  let items = strokes.map(s => ({ s, box: strokeBox(s) }));
  // 忽略相對很小的點（例如手指離開螢幕時多點到的一下），避免被當成一個「1」
  const top = Math.min(...items.map(i => i.box.y0)), bottom = Math.max(...items.map(i => i.box.y1));
  const height = Math.max(1, bottom - top);
  const isDot = i => Math.max(i.box.x1 - i.box.x0, i.box.y1 - i.box.y0) < 0.15 * height;
  if (items.some(i => !isDot(i))) items = items.filter(i => !isDot(i));
  items.sort((a, b) => a.box.x0 - b.box.x0);
  const groups = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g) {
      const overlap = Math.min(g.box.x1, it.box.x1) - Math.max(g.box.x0, it.box.x0);
      const narrower = Math.max(1, Math.min(g.box.x1 - g.box.x0, it.box.x1 - it.box.x0));
      if (overlap >= 0.3 * narrower) {
        g.strokes.push(it.s);
        g.box = {
          x0: Math.min(g.box.x0, it.box.x0), x1: Math.max(g.box.x1, it.box.x1),
          y0: Math.min(g.box.y0, it.box.y0), y1: Math.max(g.box.y1, it.box.y1),
        };
        continue;
      }
    }
    groups.push({ strokes: [it.s], box: { ...it.box } });
  }

  // 兩位數的兩個字都差不多高；如果某一塊明顯比較矮（例如 4 左上角的短短一撇），
  // 它不是獨立的字，併到左右最近的那一塊
  const mergeBoxes = (a, b) => ({
    x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1),
  });
  while (groups.length > 1) {
    const heights = groups.map(g => g.box.y1 - g.box.y0);
    const tallest = Math.max(...heights);
    const i = heights.findIndex(hh => hh < 0.6 * tallest);
    if (i === -1) break;
    const left = groups[i - 1], right = groups[i + 1];
    const gapTo = n => (n ? Math.max(0, Math.max(n.box.x0, groups[i].box.x0) - Math.min(n.box.x1, groups[i].box.x1)) : Infinity);
    const target = gapTo(left) <= gapTo(right) ? i - 1 : i + 1;
    // 離左右兩邊都有一段距離、而且自己是封閉圈的矮字，是獨立的字（例如 10 的 0 寫得比較小），不要併進去；
    // 4 左上角的短短一撇不是封閉的，照樣併進去
    const g = groups[i].strokes;
    const closed = g.some(st => st.unordered) ? g.some(st => st.loop) : hasClosedLoop(g);
    if (closed && Math.min(gapTo(left), gapTo(right)) >= SHORT_PART_MAX_GAP * tallest) break;
    groups[target].strokes.push(...groups[i].strokes);
    groups[target].box = mergeBoxes(groups[target].box, groups[i].box);
    groups.splice(i, 1);
  }
  return groups;
}

/**
 * 從一堆沒有順序的點中，平均挑出 n 個點（最遠點取樣）。
 * 拍照模式的筆跡來自影像骨架，沒有「沿著筆跡走」的順序，所以用這個方式取樣。
 */
export function farthestPointSample(points, n) {
  if (points.length <= n) {
    const out = points.slice();
    while (out.length < n) out.push(points[out.length % points.length]);
    return out;
  }
  const out = [points[0]];
  const d = new Float64Array(points.length).fill(Infinity);
  while (out.length < n) {
    const last = out[out.length - 1];
    let bi = 0, bd = -1;
    for (let i = 0; i < points.length; i++) {
      const dd = Math.hypot(points[i].x - last.x, points[i].y - last.y);
      if (dd < d[i]) d[i] = dd;
      if (d[i] > bd) { bd = d[i]; bi = i; }
    }
    out.push(points[bi]);
  }
  return out;
}

/** 辨識一個字元的筆畫 */
function classifyGroup(strokes) {
  if (strokes.some(s => s.unordered)) {
    // 拍照模式：點沒有順序，圈圈資訊在影像處理時就判斷好了（s.loop）
    const pts = strokes.flatMap(s => s.points);
    const cloud = normalize(farthestPointSample(pts, N).map(p => ({ x: p.x, y: p.y, id: 0 })));
    return classifyCloud(cloud, strokes.some(s => s.loop), { unordered: true });
  }
  return classifyCloud(strokesToCloud(strokes), hasClosedLoop(strokes));
}

/**
 * 辨識一組筆畫（可能是 1~2 位數）。手繪（有筆畫順序）與拍照（沒有順序）都適用。
 * @returns {{ digits: string, chars: Array, groups: Array }}
 */
export function recognizeCluster(cluster) {
  const groups = segmentCharacters(cluster.strokes);
  const chars = groups.map(g => classifyGroup(g.strokes));
  // groups：每個字的筆畫，雲端輔助辨識（utils/cloudAssist.js）要把沒把握的字單獨畫成小圖
  return { digits: chars.map(c => c.digit).join(''), chars, groups: groups.map(g => g.strokes) };
}
