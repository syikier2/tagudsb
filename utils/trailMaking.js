// utils/trailMaking.js
// 連線測驗（Trail Making Test）的核心邏輯：產生圓圈版面、判斷連線、統計結果。
// 和畫面分開，方便寫自動測試（tests/trail.test.mjs）。
//
//   A 部分：1 → 2 → 3 → … → 12（處理速度、視覺搜尋）
//   B 部分：1 → 甲 → 2 → 乙 → … → 5 → 戊（注意力轉換、執行功能；參考中文版 MoCA 連線題）

export const PART_A = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
export const PART_B = ['1', '甲', '2', '乙', '3', '丙', '4', '丁', '5', '戊'];

// 版面比例（寬 1、高 ASPECT）與圓圈大小（相對於寬度）
export const ASPECT = 4 / 3;
export const NODE_RADIUS = 0.075;   // 寬 350px 時直徑約 52px，長輩比較好點
const HIT_SCALE = 1.2;              // 手指進入圓圈半徑 1.2 倍以內就算碰到
const MIN_GAP = 2.8;                // 任兩個圓心至少相隔 2.8 個半徑
const SEGMENT_CLEARANCE = 1.4;      // 相鄰兩點的連線，離其他圓心至少 1.4 個半徑（不會穿過別的圓圈）
const MIN_SEGMENT = 0.18;           // 相鄰兩點至少相隔這麼遠，避免太容易
const MAX_SEGMENT = 0.65;           // 也不要太遠

// ---- 版面產生（固定亂數種子：每個人拿到的版面都一樣，結果才能比較）---------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 點 p 到線段 ab 的距離 */
export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 兩線段是否相交（不含共用端點） */
export function segmentsCross(a, b, c, d) {
  const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function tryLayout(count, rand) {
  const r = NODE_RADIUS, margin = r * 1.3;
  const nodes = [];
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 400 && !placed; attempt++) {
      const p = { x: margin + rand() * (1 - 2 * margin), y: margin + rand() * (ASPECT - 2 * margin) };
      if (nodes.some(q => Math.hypot(p.x - q.x, p.y - q.y) < MIN_GAP * r)) continue;
      if (i > 0) {
        const prev = nodes[i - 1];
        const len = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (len < MIN_SEGMENT || len > MAX_SEGMENT) continue;
        // 新的一段不能穿過已經放好的圓圈
        if (nodes.slice(0, i - 1).some(q => pointSegmentDistance(q, prev, p) < SEGMENT_CLEARANCE * r)) continue;
        // 新的圓圈不能擋在之前的路線上
        let blocks = false;
        for (let k = 1; k < i; k++) if (pointSegmentDistance(p, nodes[k - 1], nodes[k]) < SEGMENT_CLEARANCE * r) blocks = true;
        if (blocks) continue;
        // 路線不和自己交叉
        let crosses = false;
        for (let k = 1; k < i - 1; k++) if (segmentsCross(nodes[k - 1], nodes[k], prev, p)) crosses = true;
        if (crosses) continue;
      }
      nodes.push(p);
      placed = true;
    }
    if (!placed) return null;
  }
  return nodes;
}

/**
 * 產生版面。座標範圍：x 0~1、y 0~ASPECT（顯示時乘上畫面寬度）。
 * 同一個 seed 一定得到同一個版面。
 */
export function generateLayout(labels, seed) {
  for (let s = seed; s < seed + 500; s++) {
    const nodes = tryLayout(labels.length, mulberry32(s));
    if (nodes) return nodes.map((p, i) => ({ ...p, label: labels[i] }));
  }
  throw new Error('無法產生連線測驗版面');
}

// 標準版面：固定不變，需要嚴格前後比較時使用
export const LAYOUT_A = generateLayout(PART_A, 20261010);
export const LAYOUT_B = generateLayout(PART_B, 11510);

// ---- 每次不同的版面（難度與標準版面相近）--------------------------------------------
// 一直用同一個版面，受測者會記住位置（練習效應）；完全隨機又會讓每次難度不同。
// 折衷：隨機產生，但只接受「整條路線總長度」和標準版面相差 8% 以內的版面。

export const LENGTH_TOLERANCE = 0.08;

/** 整條正確路線的長度（版面座標） */
export function pathLength(nodes) {
  let len = 0;
  for (let i = 1; i < nodes.length; i++) len += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
  return len;
}

export const STANDARD_LENGTH = { A: pathLength(LAYOUT_A), B: pathLength(LAYOUT_B) };
const LABELS = { A: PART_A, B: PART_B };

/** 用版面編號重現同一個版面（不符合規則時回傳 null） */
export function layoutFromSeed(part, seed) {
  const nodes = tryLayout(LABELS[part].length, mulberry32(seed));
  return nodes ? nodes.map((p, i) => ({ ...p, label: LABELS[part][i] })) : null;
}

/** 這個版面的難度是否和標準版面相近 */
export function isMatched(part, nodes) {
  return Math.abs(pathLength(nodes) - STANDARD_LENGTH[part]) / STANDARD_LENGTH[part] <= LENGTH_TOLERANCE;
}

/**
 * 產生一個新的版面
 * @param {'A'|'B'} part
 * @param {number} startSeed 從這個編號開始找（App 用隨機數，測試用固定數）
 * @returns {{ nodes, seed }} seed = 版面編號，存進歷史紀錄，之後可用 layoutFromSeed 重現
 */
export function randomLayout(part, startSeed = Math.floor(Math.random() * 2 ** 31)) {
  for (let k = 0; k < 2000; k++) {
    const seed = (startSeed + k * 7919) >>> 0;
    const nodes = layoutFromSeed(part, seed);
    if (nodes && isMatched(part, nodes)) return { nodes, seed };
  }
  return { nodes: part === 'A' ? LAYOUT_A : LAYOUT_B, seed: null }; // 理論上不會發生：退回標準版面
}

/**
 * 一次測驗用的兩個版面
 * @param {'random'|'standard'} mode
 */
export function layoutsFor(mode, startSeed) {
  if (mode === 'standard') return { mode, A: LAYOUT_A, B: LAYOUT_B, seedA: null, seedB: null };
  const a = randomLayout('A', startSeed);
  const b = randomLayout('B', startSeed == null ? undefined : startSeed + 1);
  return { mode, A: a.nodes, B: b.nodes, seedA: a.seed, seedB: b.seed };
}

// ---- 連線判斷 -------------------------------------------------------------------

/** 手指位置（版面座標）碰到哪個圓圈；沒碰到回傳 -1 */
export function hitNode(nodes, p) {
  let best = -1, bestD = NODE_RADIUS * HIT_SCALE;
  nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

export function createSession(nodes) {
  return { nodes, path: [], errors: 0, lifts: 0, startedAt: null, finishedAt: null, active: false, lastWrong: -1 };
}

const done = s => s.path.length === s.nodes.length;

/**
 * 手指按下
 * @returns {{ state, event: null | {type:'start'|'resume'|'wrongStart'|'needResume', index?} }}
 */
export function touchDown(state, p, t) {
  if (done(state)) return { state, event: null };
  const hit = hitNode(state.nodes, p);
  if (state.path.length === 0) {
    if (hit === 0) return { state: { ...state, path: [0], startedAt: t, active: true }, event: { type: 'start', index: 0 } };
    return { state, event: { type: 'wrongStart', index: hit } };
  }
  const last = state.path[state.path.length - 1];
  if (hit === last) return { state: { ...state, active: true, lastWrong: -1 }, event: { type: 'resume', index: last } };
  return { state, event: { type: 'needResume', index: last } }; // 要從最後連到的圓圈繼續
}

/**
 * 手指移動
 * @returns {{ state, event: null | {type:'connect'|'finish'|'error', index} }}
 */
export function touchMove(state, p, t) {
  if (!state.active || done(state)) return { state, event: null };
  const hit = hitNode(state.nodes, p);
  if (hit === -1) return { state: state.lastWrong === -1 ? state : { ...state, lastWrong: -1 }, event: null };
  const next = state.path.length;
  if (hit === next) {
    const path = [...state.path, hit];
    const finished = path.length === state.nodes.length;
    return {
      state: { ...state, path, lastWrong: -1, active: !finished, finishedAt: finished ? t : null },
      event: { type: finished ? 'finish' : 'connect', index: hit },
    };
  }
  if (state.path.includes(hit) || hit === state.lastWrong) return { state, event: null }; // 經過已連的圓圈不算錯
  return { state: { ...state, errors: state.errors + 1, lastWrong: hit }, event: { type: 'error', index: hit } };
}

/** 手指放開：還沒完成就放開，記一次 */
export function touchUp(state) {
  if (!state.active || done(state)) return { state: { ...state, active: false }, event: null };
  return { state: { ...state, active: false, lifts: state.lifts + 1 }, event: { type: 'lift' } };
}

// ---- 結果 ------------------------------------------------------------------------

export function partResult(state) {
  const completed = done(state);
  return {
    completed,
    durationSec: completed ? (state.finishedAt - state.startedAt) / 1000 : null,
    errors: state.errors,
    lifts: state.lifts,
  };
}

/**
 * 整體結果
 * - B/A 時間比：研究上常用來看執行功能（排除單純手速慢的影響）
 * - MoCA 連線題：B 部分依序連完、沒有連錯，才算通過
 */
export function summarize(a, b) {
  const ratio = a.completed && b.completed && a.durationSec > 0 ? b.durationSec / a.durationSec : null;
  const mocaPass = b.completed && b.errors === 0;
  const notes = [];
  if (mocaPass) notes.push('B 部分依序連完且沒有連錯，MoCA 連線題通過。');
  else if (b.completed) notes.push(`B 部分連錯 ${b.errors} 次，MoCA 連線題未通過。`);
  else notes.push('B 部分沒有完成。');
  if (ratio != null) notes.push(`B 部分花的時間是 A 部分的 ${ratio.toFixed(1)} 倍。`);
  return { ratio, mocaPass, notes };
}
