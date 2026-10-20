// tests/trail.test.mjs
// 連線測驗：版面規則、連線判斷、結果統計。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ASPECT, createSession, generateLayout, LAYOUT_A, LAYOUT_B, layoutFromSeed, layoutsFor, LENGTH_TOLERANCE,
  NODE_RADIUS, PART_A, PART_B, partResult, pathLength, pointSegmentDistance, randomLayout, segmentsCross,
  STANDARD_LENGTH, summarize, touchDown, touchMove, touchUp,
} from '../utils/trailMaking.js';

/** 版面規則：圓圈在範圍內、不重疊；正確路線不穿過其他圓圈、不和自己交叉 */
function checkRules(layout, labels) {
  assert.equal(layout.length, labels.length);
  assert.deepEqual(layout.map(n => n.label), labels);
  for (const n of layout) {
    assert.ok(n.x >= NODE_RADIUS && n.x <= 1 - NODE_RADIUS);
    assert.ok(n.y >= NODE_RADIUS && n.y <= ASPECT - NODE_RADIUS);
  }
  for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
    assert.ok(Math.hypot(layout[i].x - layout[j].x, layout[i].y - layout[j].y) >= 2.5 * NODE_RADIUS);
  }
  for (let k = 1; k < layout.length; k++) {
    layout.forEach((n, i) => {
      if (i !== k && i !== k - 1) assert.ok(pointSegmentDistance(n, layout[k - 1], layout[k]) >= 1.3 * NODE_RADIUS);
    });
    for (let j = 1; j < k - 1; j++) assert.equal(segmentsCross(layout[j - 1], layout[j], layout[k - 1], layout[k]), false);
  }
}

test('每次不同的版面：200 組都符合版面規則，路線長度和標準版面相差 8% 以內', () => {
  for (const [part, labels] of [['A', PART_A], ['B', PART_B]]) {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const { nodes, seed } = randomLayout(part, 1000 + i * 31337);
      assert.notEqual(seed, null);
      checkRules(nodes, labels);
      const diff = Math.abs(pathLength(nodes) - STANDARD_LENGTH[part]) / STANDARD_LENGTH[part];
      assert.ok(diff <= LENGTH_TOLERANCE, `${part} 版面 ${seed} 長度差 ${(diff * 100).toFixed(1)}%`);
      seen.add(nodes.map(n => `${n.x.toFixed(3)},${n.y.toFixed(3)}`).join(';'));
    }
    assert.ok(seen.size >= 190, `${part}：200 次中有 ${seen.size} 種不同版面`);
  }
});

test('版面編號可以重現同一個版面', () => {
  const { nodes, seed } = randomLayout('B', 424242);
  assert.deepEqual(layoutFromSeed('B', seed), nodes);
});

test('選「標準版面」時用固定版面，不產生編號', () => {
  const s = layoutsFor('standard');
  assert.equal(s.A, LAYOUT_A);
  assert.equal(s.seedA, null);
  const r = layoutsFor('random', 7);
  assert.equal(r.mode, 'random');
  assert.notEqual(r.seedB, null);
});

for (const [name, layout, labels] of [['A', LAYOUT_A, PART_A], ['B', LAYOUT_B, PART_B]]) {
  test(`版面 ${name}：圓圈都在範圍內、互不重疊`, () => {
    assert.equal(layout.length, labels.length);
    for (const n of layout) {
      assert.ok(n.x >= NODE_RADIUS && n.x <= 1 - NODE_RADIUS, `x=${n.x}`);
      assert.ok(n.y >= NODE_RADIUS && n.y <= ASPECT - NODE_RADIUS, `y=${n.y}`);
    }
    for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
      assert.ok(Math.hypot(layout[i].x - layout[j].x, layout[i].y - layout[j].y) >= 2.5 * NODE_RADIUS);
    }
  });

  test(`版面 ${name}：正確路線不會穿過其他圓圈，也不會和自己交叉`, () => {
    for (let k = 1; k < layout.length; k++) {
      layout.forEach((n, i) => {
        if (i === k || i === k - 1) return;
        assert.ok(pointSegmentDistance(n, layout[k - 1], layout[k]) >= 1.3 * NODE_RADIUS, `第 ${k} 段穿過 ${n.label}`);
      });
      for (let j = 1; j < k - 1; j++) assert.equal(segmentsCross(layout[j - 1], layout[j], layout[k - 1], layout[k]), false);
    }
  });
}

test('版面固定：同一個種子每次都產生同樣的版面', () => {
  assert.deepEqual(generateLayout(PART_A, 20261010), LAYOUT_A);
});

/** 模擬手指從圓圈 i 拖到圓圈 j（沿直線取點） */
function drag(state, from, to, t0) {
  let s = state, events = [];
  for (let k = 0; k <= 20; k++) {
    const p = { x: from.x + ((to.x - from.x) * k) / 20, y: from.y + ((to.y - from.y) * k) / 20 };
    const r = touchMove(s, p, t0 + k * 10);
    s = r.state;
    if (r.event) events.push(r.event);
  }
  return { state: s, events };
}

function completeRun(layout, { wrongDetour = false, liftAt = -1 } = {}) {
  let s = touchDown(createSession(layout), layout[0], 1000).state;
  let t = 1000;
  for (let i = 1; i < layout.length; i++) {
    if (wrongDetour && i === 3) {
      // 先去碰一個錯的圓圈，再回到正確的
      const wrong = layout[layout.length - 1];
      s = drag(s, layout[i - 1], wrong, t).state;
      s = drag(s, wrong, layout[i - 1], t).state;
    }
    if (i === liftAt) {
      s = touchUp(s).state;
      s = touchDown(s, layout[i - 1], t).state;
    }
    s = drag(s, layout[i - 1], layout[i], t).state;
    t += 1000;
  }
  return s;
}

test('依序連完：完成、沒有錯誤、時間正確', () => {
  const s = completeRun(LAYOUT_A);
  const r = partResult(s);
  assert.equal(r.completed, true);
  assert.equal(r.errors, 0);
  assert.equal(r.lifts, 0);
  assert.ok(r.durationSec > 10 && r.durationSec < 12, `${r.durationSec}`);
});

test('碰到錯的圓圈：記一次錯誤，停在上面不會重複記', () => {
  const s = completeRun(LAYOUT_B, { wrongDetour: true });
  assert.equal(partResult(s).completed, true);
  assert.equal(s.errors, 1);
});

test('中途放開手指，再從最後一個圓圈繼續：記一次放開', () => {
  const s = completeRun(LAYOUT_A, { liftAt: 5 });
  assert.equal(partResult(s).completed, true);
  assert.equal(s.lifts, 1);
});

test('一定要從 1 開始；放開後要從最後連到的圓圈繼續', () => {
  let s = createSession(LAYOUT_A);
  assert.equal(touchDown(s, LAYOUT_A[3], 0).event.type, 'wrongStart');
  s = touchDown(s, LAYOUT_A[0], 0).state;
  s = drag(s, LAYOUT_A[0], LAYOUT_A[1], 0).state;
  s = touchUp(s).state;
  assert.equal(touchDown(s, LAYOUT_A[5], 0).event.type, 'needResume');
  assert.equal(touchDown(s, LAYOUT_A[1], 0).event.type, 'resume');
});

test('經過已經連過的圓圈不算錯', () => {
  let s = touchDown(createSession(LAYOUT_A), LAYOUT_A[0], 0).state;
  s = drag(s, LAYOUT_A[0], LAYOUT_A[1], 0).state;
  s = drag(s, LAYOUT_A[1], LAYOUT_A[0], 0).state; // 往回經過 1
  assert.equal(s.errors, 0);
});

test('結果：B/A 比值與 MoCA 連線題判定', () => {
  const a = { completed: true, durationSec: 20, errors: 0, lifts: 0 };
  assert.equal(summarize(a, { completed: true, durationSec: 50, errors: 0, lifts: 0 }).mocaPass, true);
  assert.equal(summarize(a, { completed: true, durationSec: 50, errors: 0, lifts: 0 }).ratio, 2.5);
  assert.equal(summarize(a, { completed: true, durationSec: 50, errors: 2, lifts: 0 }).mocaPass, false);
  assert.equal(summarize(a, { completed: false, durationSec: null, errors: 0, lifts: 0 }).mocaPass, false);
});
