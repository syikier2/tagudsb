// tests/photo.test.mjs
// 拍照模式：用真實的紙本畫鐘照片測試整個流程（皆已縮放到寬 1000px，和 App 分析前的處理相同）。
// photo-clock-1.jpg              真實照片：淡藍色原子筆、較模糊、沒有畫指針
// photo-clock-2.jpg              真實照片：有畫指針（含箭頭）、紙張有污漬
// photo-clock-3.jpg              真實照片：有畫指針、圓圈描了兩次、4 碰到圓圈
// photo-clock-1-shadow.jpg       照片 1 左半邊用程式調暗（模擬陰影）
// photo-clock-1-with-hands.jpg   照片 1 用程式畫上「3 點整」的指針（模擬畫錯時間）
// photo-digits.json              從照片 1～3 擷取的 45 個數字骨架（逐字測辨識率）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { recognizeCluster } from '../utils/digitRecognizer.js';
import { scoreHands } from '../utils/handsScoring.js';
import { analyzePhotoClock } from '../utils/photoClock.js';

const load = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url)).toString('base64');

test('真實照片 1：12 個數字位置正確，輪廓通過，沒有指針', async () => {
  const r = await analyzePhotoClock(load('photo-clock-1.jpg'));
  assert.deepEqual(r.numbers.missing, [], `缺少：${r.numbers.missing}`);
  assert.equal(r.numbers.score, 5);
  assert.equal(r.contour.pass, true);
  assert.equal(r.hands.rays.length, 0, '照片上沒有畫指針');
});

for (const name of ['photo-clock-2.jpg', 'photo-clock-3.jpg']) {
  test(`真實照片 ${name}：MoCA 輪廓、數字、指針三項全部通過`, async () => {
    const r = await analyzePhotoClock(load(name));
    assert.deepEqual(r.numbers.missing, [], `缺少：${r.numbers.missing}`);
    assert.equal(r.numbers.score, 5);
    assert.equal(r.contour.pass, true, '輪廓');
    assert.equal(r.numbersPass, true, '數字');
    assert.equal(r.hands.pass, true, `指針：${r.hands.messages.join(' ')}`);
  });
}

test('照片有明顯陰影：仍然 12 個數字都找到', async () => {
  const r = await analyzePhotoClock(load('photo-clock-1-shadow.jpg'));
  assert.deepEqual(r.numbers.missing, []);
});

test('照片上的指針畫成 3 點整：指針判為錯誤，數字不受影響', async () => {
  const r = await analyzePhotoClock(load('photo-clock-1-with-hands.jpg'));
  assert.equal(r.hands.rays.length, 2);
  assert.equal(r.hands.checks.direction, false);
  assert.equal(r.numbers.score, 5);
});

test('照片擷取的 45 個數字：至少 44 個辨識正確', () => {
  const { samples } = JSON.parse(readFileSync(new URL('./fixtures/photo-digits.json', import.meta.url), 'utf8'));
  const wrong = [];
  for (const s of samples) {
    const strokes = s.strokes.map((pts, i) => ({ points: pts.map(([x, y]) => ({ x, y })), loop: s.loops[i], unordered: true }));
    const got = recognizeCluster({ strokes }).digits;
    if (got !== s.truth) wrong.push(`${s.source}：「${s.truth}」被認成「${got}」`);
  }
  // 目前已知：照片 2 的 4 單獨辨識時會被認成 9（整張照片分析時，轉正後可以認對）
  assert.ok(wrong.length <= 1, `辨識錯誤：\n${wrong.join('\n')}`);
});

test('沒有順序的點（照片骨架）也能找出兩根指針', () => {
  const S = 300, c = S / 2;
  const line = (ang, len) => Array.from({ length: 40 }, (_, k) => ({
    x: c + ((len * k) / 39) * Math.sin((ang * Math.PI) / 180),
    y: c - ((len * k) / 39) * Math.cos((ang * Math.PI) / 180),
  }));
  const pts = [...line(335, 0.2 * S), ...line(60, 0.34 * S)].sort(() => 0.5 - Math.random());
  const r = scoreHands([{ points: pts, unordered: true }], { width: S, height: S });
  assert.equal(r.pass, true, r.messages.join(' '));
});

test('時針很短（只有鐘面半徑的 1/4）也算一根指針', () => {
  const S = 300, c = S / 2;
  const hand = (ang, len) => ({ points: Array.from({ length: 30 }, (_, k) => ({
    x: c + ((len * k) / 29) * Math.sin((ang * Math.PI) / 180),
    y: c - ((len * k) / 29) * Math.cos((ang * Math.PI) / 180),
  })) });
  const r = scoreHands([hand(335, 0.11 * S), hand(60, 0.34 * S)], { width: S, height: S });
  assert.equal(r.checks.count, true);
  assert.equal(r.pass, true, r.messages.join(' '));
});
