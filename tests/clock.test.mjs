// tests/clock.test.mjs
// 完整流程：筆畫分組 → 辨識 → 數字位置評分；以及指針評分、作畫過程。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreClock, scoreTokens } from '../utils/clockScoring.js';
import { recognizeCluster } from '../utils/digitRecognizer.js';
import { computeDrawingStats } from '../utils/drawingStats.js';
import { scoreHands, targetsFromNumbers } from '../utils/handsScoring.js';
import { clusterStrokes, parseStrokes, renderSheet } from '../utils/strokeClusters.js';
import { buildClock, densify, drawHand } from './helpers.mjs';

const S = 330;
const canvas = { width: S, height: S };

/** 和 App 手繪模式相同的流程 */
function analyze(rawStrokes) {
  const strokes = parseStrokes(JSON.stringify(rawStrokes));
  const { clusters, handStrokes, ignored } = clusterStrokes(strokes, canvas);
  const tokens = clusters.map(c => ({
    digits: recognizeCluster(c).digits,
    box: { ...c.box, h: c.box.y1 - c.box.y0 },
  }));
  const numbers = scoreTokens(tokens, { centerX: S / 2, centerY: S / 2 });
  const hands = scoreHands(handStrokes, canvas);
  return { numbers, hands, clusters, ignored, strokes };
}

// ---- 數字 ------------------------------------------------------------------

test('完整正確的鐘：5 分', () => {
  const r = analyze(buildClock(S));
  // 11 的兩個 1 距離較遠時會分成兩組，評分時會再合併回 11，所以組數可能是 12 或 13
  assert.ok(r.clusters.length >= 12 && r.clusters.length <= 13, `分組數 ${r.clusters.length}`);
  assert.equal(r.numbers.score, 5);
  assert.equal(r.numbers.correctCount, 12);
});

test('缺 7～10：分數下降，並列出缺少的數字', () => {
  const r = analyze(buildClock(S, { skip: [7, 8, 9, 10] }));
  assert.deepEqual(r.numbers.missing, [7, 8, 9, 10]);
  assert.ok(r.numbers.score <= 3);
});

test('3 和 9 位置對調：兩個都判為位置偏移', () => {
  const r = analyze(buildClock(S, { moveTo: { 3: 9, 9: 3 } }));
  assert.deepEqual(r.numbers.misplaced.sort((a, b) => a - b), [3, 9]);
  assert.ok(r.numbers.score < 5);
});

test('自己畫的大圓圈會被排除，不影響數字', () => {
  const circle = { points: Array.from({ length: 121 }, (_, i) => {
    const a = (i * 3 * Math.PI) / 180;
    return { x: S / 2 + 0.47 * S * Math.cos(a), y: S / 2 + 0.47 * S * Math.sin(a) };
  }) };
  const r = analyze([...buildClock(S), circle]);
  assert.equal(r.ignored.circle, 1);
  assert.equal(r.numbers.score, 5);
});

test('評分不會跳分：只寫 12、3、6、9 只拿 1 分', () => {
  const r = analyze(buildClock(S, { skip: [1, 2, 4, 5, 7, 8, 10, 11] }));
  assert.equal(r.numbers.score, 1);
});

test('拍照模式（OCR 結果）：被拆開的「1」「2」會合併回 12', () => {
  const box = (t, x, y, w = 30) => ({
    description: t,
    boundingPoly: { vertices: [{ x: x - w / 2, y: y - 20 }, { x: x + w / 2, y: y - 20 }, { x: x + w / 2, y: y + 20 }, { x: x - w / 2, y: y + 20 }] },
  });
  const ann = [{ description: 'all' }];
  for (let n = 1; n <= 11; n++) {
    const a = (n * 30 * Math.PI) / 180;
    ann.push(box(String(n), 300 + 240 * Math.sin(a), 300 - 240 * Math.cos(a)));
  }
  ann.push(box('1', 286, 60, 20), box('2', 314, 60, 20));
  const r = scoreClock(ann, { imageWidth: 600, imageHeight: 600, centerMode: 'image' });
  assert.equal(r.score, 5);
});

test('字卡圖能正常產生（偵錯畫面用）', () => {
  const { clusters } = clusterStrokes(parseStrokes(JSON.stringify(buildClock(S))), canvas);
  const sheet = renderSheet(clusters);
  assert.ok(sheet.base64.startsWith('Qk')); // "BM" 的 base64
  assert.equal(sheet.width % 200, 0);
});

// ---- 指針 ------------------------------------------------------------------

test('指針：正確的 11 點 10 分', () => {
  const r = analyze([...buildClock(S), drawHand(S, 335, 0.2 * S), drawHand(S, 60, 0.34 * S)]);
  assert.equal(r.hands.pass, true);
  assert.equal(r.numbers.score, 5, '指針不應影響數字評分');
});

test('指針：一筆畫成 V 字也可以', () => {
  const c = S / 2;
  const tip = (a, len) => [c + len * Math.sin((a * Math.PI) / 180), c - len * Math.cos((a * Math.PI) / 180)];
  const v = { points: densify([tip(335, 0.2 * S), [c, c], tip(60, 0.34 * S)]) };
  assert.equal(analyze([v]).hands.pass, true);
});

test('指針：時針和分針長短畫反', () => {
  const r = analyze([drawHand(S, 335, 0.34 * S), drawHand(S, 60, 0.2 * S)]);
  assert.equal(r.hands.pass, false);
  assert.equal(r.hands.checks.length, false);
  assert.equal(r.hands.checks.direction, true);
});

test('指針：畫成 3 點整', () => {
  const r = analyze([drawHand(S, 90, 0.2 * S), drawHand(S, 0, 0.34 * S)]);
  assert.equal(r.hands.checks.direction, false);
});

test('指針：只畫一根', () => {
  const r = analyze([drawHand(S, 60, 0.34 * S)]);
  assert.equal(r.hands.checks.count, false);
});

test('指針：沒畫', () => {
  const r = analyze(buildClock(S));
  assert.equal(r.hands.pass, false);
  assert.equal(r.hands.rays.length, 0);
});

test('指針：同一根描了兩次仍算兩根', () => {
  const r = analyze([drawHand(S, 335, 0.2 * S), drawHand(S, 337, 0.19 * S), drawHand(S, 60, 0.34 * S)]);
  assert.equal(r.hands.pass, true);
});

test('指針以受測者畫的數字位置為準：整個鐘（數字和指針）都轉了 25°，指針仍然算對', () => {
  const rot = (strokes, deg) => {
    const a = (deg * Math.PI) / 180, c = S / 2;
    return strokes.map(s => ({ points: s.points.map(p => ({
      x: c + (p.x - c) * Math.cos(a) - (p.y - c) * Math.sin(a),
      y: c + (p.x - c) * Math.sin(a) + (p.y - c) * Math.cos(a),
      time: p.time,
    })) }));
  };
  const strokes = parseStrokes(JSON.stringify(rot([...buildClock(S), drawHand(S, 335, 0.2 * S), drawHand(S, 60, 0.34 * S)], 25)));
  const { clusters, handStrokes } = clusterStrokes(strokes, canvas);
  const tokens = clusters.map(c => ({ digits: recognizeCluster(c).digits, box: { ...c.box, h: c.box.y1 - c.box.y0 } }));
  const numbers = scoreTokens(tokens, { centerX: S / 2, centerY: S / 2 });
  assert.equal(scoreHands(handStrokes, canvas).checks.direction, false, '用標準角度判斷會錯');
  assert.equal(scoreHands(handStrokes, canvas, undefined, targetsFromNumbers(numbers.numbers)).pass, true, '以畫的數字為準就對');
});

// ---- 作畫過程 ----------------------------------------------------------------

test('作畫過程：時間、停頓、次數計算正確', () => {
  const strokes = parseStrokes(JSON.stringify([
    { points: [{ x: 0, y: 0, time: 1000 }, { x: 1, y: 1, time: 1500 }] },
    { points: [{ x: 0, y: 0, time: 2500 }, { x: 1, y: 1, time: 3000 }] }, // 停頓 1 秒
    { points: [{ x: 0, y: 0, time: 7000 }, { x: 1, y: 1, time: 8000 }] }, // 停頓 4 秒
  ]));
  const stats = computeDrawingStats(strokes, { startedAt: 0, clears: 1, undos: 2 });
  assert.equal(stats.durationSec, 8);
  assert.equal(stats.longestPauseSec, 4);
  assert.equal(stats.strokeCount, 3);
  assert.equal(stats.clears, 1);
  assert.equal(stats.undos, 2);
});
