// utils/strokeClusters.js
// 手繪模式專用：利用畫布的筆畫座標，把每個數字切開來單獨辨識。
//
// 流程：
//   1. parseStrokes      解析畫布回傳的筆畫資料
//   2. clusterStrokes    排除圓圈與指針，把靠在一起的筆畫分成一組一組（每組通常是一個數字）
//   3. renderSheet       把每組數字重新畫在一張「字卡格子圖」上，彼此隔開，只送一次 OCR
//   4. readSheetTexts    把 OCR 讀到的字，依位置分回每一組
//   5. clustersToTokens  轉成評分模組需要的格式（位置用原本的筆畫座標）

import { encodeGrayBmpBase64 } from './bmp.js';

// ---- 可調整的參數 -------------------------------------------------------
const BIG_STROKE_RATIO = 0.4;    // 單一筆畫超過畫布 40% 寬或高 → 視為圓圈，不是數字
const CENTER_ZONE_RATIO = 0.12;  // 筆畫經過畫布中心這個範圍內 → 視為指針
const HAND_INNER_RATIO = 0.22;   // 沒碰到中心、但從中心附近（22% 內）往外延伸很長的筆畫，也視為指針
const HAND_RADIAL_RATIO = 0.15;  // 「往外延伸很長」：離圓心最近與最遠的距離差超過畫布 15%
const JOIN_GAP_RATIO = 0.05;     // 兩筆畫距離小於畫布 5%，而且角度差很小 → 屬於同一個數字
const SAME_NUMBER_ANGLE = 14;    // 同一個數字的筆畫，從圓心看過去的角度差（度）；相鄰兩個數字約差 30°
const TOUCH_GAP = 2;             // 兩筆畫直接碰在一起（像素）
const TOUCH_MAX_ANGLE = 22;      // 碰在一起時，角度差在這以內才合併，避免把相鄰兩個數字黏成一組
const MIN_CLUSTER_RATIO = 0.015; // 小於畫布 1.5% 的小點 → 雜訊

const SHEET_COLS = 4;
const CELL_W = 200;
const CELL_H = 160;
const GLYPH_MAX_W = 140;
const GLYPH_MAX_H = 100;
const PEN_RADIUS = 3.5;

/** 解析 onGetData 回傳的 JSON，回傳 [{ points: [{x, y, t}] }]（t = 畫下這一點的時間，毫秒） */
export function parseStrokes(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .map(group => {
      const pts = Array.isArray(group) ? group : group?.points;
      return {
        points: (pts || [])
          .filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
          .map(p => (Number.isFinite(p.time) ? { x: p.x, y: p.y, t: p.time } : { x: p.x, y: p.y })),
      };
    })
    .filter(s => s.points.length > 0);
}

function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/** 從圓心看過去的角度：12 點方向為 0°，順時針增加 */
function angleFromCenter(x, y, cx, cy) {
  let a = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

function angleBetween(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  return Math.hypot(dx, dy);
}

/**
 * 把筆畫分組
 * @param {Array} strokes parseStrokes 的結果
 * @param {{width:number, height:number}} canvas 畫布大小（與筆畫座標同單位）
 * @returns {{ clusters: Array, handStrokes: Array, ignored: { circle:number, hands:number, noise:number } }}
 */
export function clusterStrokes(strokes, { width, height }) {
  const size = Math.min(width, height);
  const cx = width / 2, cy = height / 2;
  const ignored = { circle: 0, hands: 0, noise: 0 };
  const handStrokes = [];

  const kept = [];
  for (const s of strokes) {
    const b = bboxOf(s.points);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    if (Math.max(bw, bh) < MIN_CLUSTER_RATIO * size) {
      ignored.noise++; // 點一下的小點，不是數字的一部分
      continue;
    }
    // 指針：經過圓心附近，或從圓心附近往外延伸很長。要先判斷，
    // 否則很長的分針、或一筆畫完兩根指針的 V 字，會被誤當成圓圈。
    const radii = s.points.map(p => Math.hypot(p.x - cx, p.y - cy));
    const minR = Math.min(...radii), maxR = Math.max(...radii);
    const isHand =
      minR < CENTER_ZONE_RATIO * size ||
      (minR < HAND_INNER_RATIO * size && maxR - minR > HAND_RADIAL_RATIO * size);
    if (isHand) {
      ignored.hands++;
      handStrokes.push(s);
      continue;
    }
    if (Math.max(bw, bh) > BIG_STROKE_RATIO * size) {
      ignored.circle++;
      continue;
    }
    const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    kept.push({ ...s, box: b, angle: angleFromCenter(mx, my, cx, cy) });
  }

  // 用 union-find 合併屬於同一個數字的筆畫。
  // 只看距離的話，排得很密的數字會像接力一樣被串成一大組，
  // 所以還要求「從圓心看過去的角度差很小」——時鐘上相鄰兩個數字約差 30°。
  const parent = kept.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const joinGap = JOIN_GAP_RATIO * size;
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const gap = boxGap(kept[i].box, kept[j].box);
      const dAngle = angleBetween(kept[i].angle, kept[j].angle);
      const sameNumber =
        (gap <= TOUCH_GAP && dAngle <= TOUCH_MAX_ANGLE) ||
        (gap <= joinGap && dAngle <= SAME_NUMBER_ANGLE);
      if (sameNumber) parent[find(i)] = find(j);
    }
  }

  const groups = new Map();
  kept.forEach((s, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  });

  const clusters = [];
  for (const members of groups.values()) {
    const box = bboxOf(members.flatMap(m => m.points));
    const w = box.x1 - box.x0, h = box.y1 - box.y0;
    if (Math.max(w, h) < MIN_CLUSTER_RATIO * size) {
      ignored.noise++;
      continue;
    }
    // 依角度排序（從 12 點方向順時針），方便除錯時對照
    const angle = angleFromCenter((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, cx, cy);
    clusters.push({ strokes: members, box, angle });
  }
  clusters.sort((a, b) => a.angle - b.angle);
  clusters.forEach((c, i) => (c.id = i + 1));
  return { clusters, handStrokes, ignored };
}

/** 在灰階點陣上畫一條粗線（沿線段蓋圓點） */
export function stampLine(pixels, W, H, ax, ay, bx, by, r) {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len));
  const r2 = r * r;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    const xMin = Math.max(0, Math.floor(px - r)), xMax = Math.min(W - 1, Math.ceil(px + r));
    const yMin = Math.max(0, Math.floor(py - r)), yMax = Math.min(H - 1, Math.ceil(py + r));
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy <= r2) pixels[y * W + x] = 0;
      }
    }
  }
}

/**
 * 把每組筆畫畫到字卡格子圖上（白底黑字），回傳 BMP base64 與格子資訊
 */
export function renderSheet(clusters) {
  const cols = Math.min(SHEET_COLS, Math.max(1, clusters.length));
  const rows = Math.max(1, Math.ceil(clusters.length / cols));
  const W = cols * CELL_W, H = rows * CELL_H;
  const pixels = new Uint8Array(W * H).fill(255);

  clusters.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const w = Math.max(1, c.box.x1 - c.box.x0), h = Math.max(1, c.box.y1 - c.box.y0);
    const scale = Math.min(GLYPH_MAX_W / w, GLYPH_MAX_H / h, 6);
    const offX = col * CELL_W + (CELL_W - w * scale) / 2;
    const offY = row * CELL_H + (CELL_H - h * scale) / 2;
    const map = p => [offX + (p.x - c.box.x0) * scale, offY + (p.y - c.box.y0) * scale];
    for (const s of c.strokes) {
      const pts = s.points.map(map);
      if (s.unordered) {
        // 拍照模式的骨架點沒有順序，逐點畫，不連線
        for (const [x, y] of pts) stampLine(pixels, W, H, x, y, x, y, PEN_RADIUS);
        continue;
      }
      if (pts.length === 1) stampLine(pixels, W, H, pts[0][0], pts[0][1], pts[0][0], pts[0][1], PEN_RADIUS);
      for (let k = 1; k < pts.length; k++) {
        stampLine(pixels, W, H, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], PEN_RADIUS);
      }
    }
  });

  return { base64: encodeGrayBmpBase64(pixels, W, H), width: W, height: H, cols, rows };
}

/**
 * 把 OCR 讀到的字依位置分回每一格
 * 同一個 OCR 字詞若橫跨多格，會依每個字元的位置分開
 * @returns {string[]} 每一組讀到的文字（與 clusters 順序相同）
 */
export function readSheetTexts(textAnnotations, sheet, clusterCount) {
  const texts = Array.from({ length: clusterCount }, () => []);
  for (const a of (textAnnotations || []).slice(1)) {
    const v = a.boundingPoly?.vertices || [];
    if (!v.length || !a.description) continue;
    const xs = v.map(p => p.x || 0), ys = v.map(p => p.y || 0);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const chars = [...a.description];
    chars.forEach((ch, k) => {
      const charX = x0 + ((k + 0.5) * (x1 - x0)) / chars.length;
      const col = Math.min(sheet.cols - 1, Math.max(0, Math.floor(charX / CELL_W)));
      const row = Math.min(sheet.rows - 1, Math.max(0, Math.floor(yMid / CELL_H)));
      const idx = row * sheet.cols + col;
      if (idx < clusterCount) texts[idx].push({ ch, x: charX });
    });
  }
  return texts.map(list => list.sort((p, q) => p.x - q.x).map(p => p.ch).join(''));
}

/** OCR 常漏掉單獨一豎的「1」：只有一筆、又細又直的筆畫就當成 1 */
function looksLikeOne(cluster) {
  if (cluster.strokes.length !== 1) return false;
  const w = cluster.box.x1 - cluster.box.x0, h = cluster.box.y1 - cluster.box.y0;
  return h > 0 && w / h < 0.4;
}

/**
 * 轉成評分用的 tokens；位置用原本的筆畫外框
 * @param {Function} normalize clockScoring 的 normalizeToken
 */
export function clustersToTokens(clusters, texts, normalize) {
  const tokens = [];
  const readings = [];
  clusters.forEach((c, i) => {
    const raw = (texts[i] || '').replace(/\s+/g, '');
    let digits = raw ? normalize(raw) : null;
    let guessed = false;
    if (!digits && !raw && looksLikeOne(c)) {
      digits = '1';
      guessed = true;
    }
    readings.push({ id: c.id, raw, digits, guessed });
    if (digits) {
      tokens.push({
        digits,
        box: { x0: c.box.x0, x1: c.box.x1, y0: c.box.y0, y1: c.box.y1, h: Math.max(1, c.box.y1 - c.box.y0) },
      });
    }
  });
  return { tokens, readings };
}
