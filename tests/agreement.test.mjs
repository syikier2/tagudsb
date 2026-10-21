// tests/agreement.test.mjs
// 人工評分：kappa 計算、App vs 評分者、評分者之間、CSV、評分存檔、畫鐘圖保存。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agreementCsv, appJudgement, cohenKappa, computeAgreement, kappaLabel } from '../utils/agreement.js';
import { compactStrokes, createDrawingStore } from '../utils/drawingStore.js';
import { renderDrawing } from '../utils/drawingRender.js';
import { createProfileStore } from '../utils/profileStore.js';
import { buildClock } from './helpers.mjs';

test('Cohen kappa：完全一致 = 1；和教科書範例相同', () => {
  assert.equal(cohenKappa([[true, true], [false, false], [true, true]]).kappa, 1);
  // 50 張：兩人都說通過 20、都說不通過 15、A 過 B 不過 5、A 不過 B 過 10 → po 0.7、pe 0.5、kappa 0.4
  const pairs = [
    ...Array(20).fill([true, true]), ...Array(15).fill([false, false]),
    ...Array(5).fill([true, false]), ...Array(10).fill([false, true]),
  ];
  const r = cohenKappa(pairs);
  assert.equal(r.n, 50);
  assert.equal(r.percent, 0.7);
  assert.ok(Math.abs(r.kappa - 0.4) < 1e-9);
  assert.equal(kappaLabel(r.kappa), '尚可');
});

test('Cohen kappa：兩邊全部都判通過時無法計算（不是 1，也不是錯誤）', () => {
  const r = cohenKappa([[true, true], [true, true]]);
  assert.equal(r.percent, 1);
  assert.equal(r.kappa, null);
  assert.equal(kappaLabel(null), '無法計算');
});

const rec = (id, items, extra = {}) => ({
  id, type: 'clock', mode: 'canvas', at: '2026-10-21T10:00:00Z', items, handsCount: true, handsDirection: items.hands, ...extra,
});

test('App 判斷：Mini-Cog 畫鐘不看指針長短；舊紀錄缺欄位時回傳 null', () => {
  const r = rec('a', { numbers: true, hands: false }, { handsDirection: true }); // MoCA 指針不過（例如時針太長），但方向對
  assert.equal(appJudgement(r).minicogClock, true);
  assert.equal(appJudgement(r).contour, null, '手繪沒有輪廓');
  assert.equal(appJudgement({ type: 'clock', items: { numbers: true, hands: true } }).minicogClock, null);
});

test('一致性：App vs 每位評分者、評分者之間', () => {
  const records = [
    rec('1', { numbers: true, hands: true }, { ratings: [{ rater: 'A', numbers: true, hands: true, minicogClock: true }, { rater: 'B', numbers: true, hands: false, minicogClock: true }] }),
    rec('2', { numbers: false, hands: false }, { ratings: [{ rater: 'A', numbers: false, hands: false, minicogClock: false }, { rater: 'B', numbers: false, hands: false, minicogClock: false }] }),
    rec('3', { numbers: true, hands: false }, { ratings: [{ rater: 'A', numbers: true, hands: false, minicogClock: false }] }),
    rec('4', { numbers: true, hands: true }), // 沒人評，不算
  ];
  const g = computeAgreement(records);
  assert.equal(g.ratedCount, 3);
  assert.deepEqual(g.raters, ['A', 'B']);
  const aNumbers = g.appVsRater.find(x => x.rater === 'A' && x.item === 'numbers');
  assert.equal(aNumbers.n, 3);
  assert.equal(aNumbers.percent, 1);
  const bHands = g.appVsRater.find(x => x.rater === 'B' && x.item === 'hands');
  assert.equal(bHands.n, 2);
  assert.equal(bHands.percent, 0.5);
  const ab = g.raterVsRater.find(x => x.item === 'numbers');
  assert.equal(ab.n, 2);
  assert.equal(ab.a, 'A');
});

test('CSV：每張畫鐘 × 每位評分者一列，Excel 可開（含 BOM）', () => {
  const csv = agreementCsv([rec('1', { numbers: true, hands: true }, { ratings: [{ rater: 'A', numbers: true, hands: false }] })]);
  assert.ok(csv.startsWith('﻿紀錄編號'));
  const rows = csv.trim().split('\n');
  assert.equal(rows.length, 2);
  assert.match(rows[1], /^1,2026-10-21,canvas,/);
});

test('評分存檔：同一位評分者重評會覆蓋；沒有代號不能評', async () => {
  const data = new Map();
  const store = createProfileStore({ getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } });
  await store.load();
  store.addProfile({ name: '甲' });
  const r = store.addResult({ type: 'clock', items: { numbers: true, hands: true } });
  store.addRating(r.id, { rater: 'A', numbers: true });
  store.addRating(r.id, { rater: 'A', numbers: false });
  store.addRating(r.id, { rater: 'B', numbers: true });
  const saved = store.getState().results[0];
  assert.equal(saved.ratings.length, 2);
  assert.equal(saved.ratings.find(x => x.rater === 'A').numbers, false);
  assert.throws(() => store.addRating(r.id, { rater: ' ', numbers: true }), /評分者代號/);
  store.setRater('老師');
  await store.flush();
  const reopened = createProfileStore({ getItem: async k => data.get(k) ?? null, setItem: async () => {} });
  await reopened.load();
  assert.equal(reopened.getState().rater, '老師');
});

test('刪除紀錄時一併刪除保存的畫鐘圖', async () => {
  const removed = [];
  const store = createProfileStore({ getItem: async () => null, setItem: async () => {} }, { onRemoveResults: ids => removed.push(...ids) });
  await store.load();
  store.addProfile({ name: '甲' });
  const r1 = store.addResult({ type: 'clock' });
  const r2 = store.addResult({ type: 'clock' });
  store.deleteResult(r1.id);
  assert.deepEqual(removed, [r1.id]);
  store.deleteProfile(store.getState().activeId);
  assert.deepEqual(removed, [r1.id, r2.id]);
});

test('畫鐘圖：精簡保存（每筆最多約 80 點）、可以畫回圖片', async () => {
  const strokes = buildClock(330);
  const d = compactStrokes(strokes, 330, 330);
  assert.equal(d.strokes.length, strokes.length);
  assert.ok(d.strokes.every(s => s.length <= 82));
  assert.ok(JSON.stringify(d).length < 40000, `大小 ${JSON.stringify(d).length}`);
  const bmp = Buffer.from(renderDrawing(d, 320), 'base64');
  assert.equal(bmp.toString('latin1', 0, 2), 'BM');

  const mem = new Map();
  const ds = createDrawingStore({ getItem: async k => mem.get(k) ?? null, setItem: async (k, v) => { mem.set(k, v); }, removeItem: async k => { mem.delete(k); } });
  await ds.save('x', d);
  assert.deepEqual(await ds.load('x'), d);
  ds.remove(['x']);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(await ds.load('x'), null);
});
