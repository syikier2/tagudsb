// tests/recognizer.test.mjs
// 數字辨識：使用者的 50 個真實手寫數字、標準寫法、圈圈判斷、小點過濾。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  classifyCloud, hasClosedLoop, normalizeCloud, recognizeCluster, segmentCharacters,
} from '../utils/digitRecognizer.js';
import { densify, GLYPHS } from './helpers.mjs';
import { farthestPointSample } from './helpers.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/handwriting.json', import.meta.url), 'utf8'));

/** 截圖擷取的樣本：骨架像素沒有筆畫順序，所以用最遠點取樣代替沿筆跡取樣 */
function recognizeSample(sample) {
  const strokes = sample.strokes.map((s, i) => ({ points: s.map(([x, y]) => ({ x, y })), loop: sample.loops[i] }));
  return segmentCharacters(strokes)
    .map(g => {
      const pts = g.strokes.flatMap(s => s.points.map(p => [p.x, p.y]));
      const cloud = normalizeCloud(farthestPointSample(pts, 32).map(([x, y]) => ({ x, y, id: 0 })));
      return classifyCloud(cloud, g.strokes.some(s => s.loop));
    })
    .map(r => r.digit)
    .join('');
}

test('使用者的 50 個真實手寫數字全部辨識正確', () => {
  const wrong = [];
  for (const s of fixture.samples) {
    const got = recognizeSample(s);
    if (got !== s.truth) wrong.push(`${s.source}：「${s.truth}」被認成「${got}」`);
  }
  assert.deepEqual(wrong, [], `辨識錯誤：\n${wrong.join('\n')}`);
});

test('標準寫法的 0～9 都辨識正確', () => {
  for (const [digit, polylines] of Object.entries(GLYPHS)) {
    const strokes = polylines.map(pl => ({ points: densify(pl, { scale: 40 }) }));
    assert.equal(recognizeCluster({ strokes }).digits, digit, `標準寫法的 ${digit}`);
  }
});

test('兩位數會切成兩個字（10、11、12）', () => {
  for (const str of ['10', '11', '12']) {
    let ox = 0;
    const strokes = [];
    for (const ch of str) {
      for (const pl of GLYPHS[ch]) strokes.push({ points: densify(pl, { scale: 40, ox }) });
      ox += 30;
    }
    assert.equal(recognizeCluster({ strokes }).digits, str);
  }
});

test('圈圈判斷：0、6、8、9 有圈；1、2、3、5、7 沒有', () => {
  const loopOf = d => hasClosedLoop(GLYPHS[d].map(pl => ({ points: densify(pl, { scale: 100 }) })));
  for (const d of ['0', '6', '8', '9']) assert.equal(loopOf(d), true, `${d} 應該有圈`);
  for (const d of ['1', '2', '3', '5', '7']) assert.equal(loopOf(d), false, `${d} 不應該有圈`);
});

test('手指多點到的小點不會被當成一個字', () => {
  const seven = { points: densify([[0, 0.25], [0.05, 0.08], [0.15, 0], [0.4, 0.02], [0.45, 0.2], [0.38, 0.6], [0.3, 1]], { scale: 40 }) };
  const dot = { points: [{ x: 13, y: 45 }] };
  assert.equal(recognizeCluster({ strokes: [seven, dot] }).digits, '7');
});
