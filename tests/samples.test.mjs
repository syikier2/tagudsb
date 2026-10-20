// tests/samples.test.mjs
// 辨識樣本收集：依位置推算答案、品質門檻、儲存與匯出。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreTokens } from '../utils/clockScoring.js';
import { recognizeCluster } from '../utils/digitRecognizer.js';
import { collectFromClock, createSampleStore, sampleStats } from '../utils/sampleCollect.js';
import { clusterStrokes } from '../utils/strokeClusters.js';
import { buildClock, writeNumber } from './helpers.mjs';

const SIZE = 330;

function analyze(strokes) {
  const canvas = { width: SIZE, height: SIZE };
  const { clusters } = clusterStrokes(strokes, canvas);
  const recs = clusters.map(c => recognizeCluster(c));
  const tokens = clusters.map((c, i) => ({ digits: recs[i].digits, box: { ...c.box, h: c.box.y1 - c.box.y0 } }));
  const scored = scoreTokens(tokens, { centerX: SIZE / 2, centerY: SIZE / 2 });
  return { clusters, recs, scored };
}

test('完整的鐘：數字都收，答案依位置推算；同一個位置有兩組筆跡就不收', () => {
  const samples = collectFromClock({ ...analyze(buildClock(SIZE)), kind: 'canvas', contributor: '同學A' });
  // 模擬筆跡的「11」兩個 1 隔得比較開，會被分成兩組、搶同一個位置，所以 11 不收，其餘 11 個都收
  assert.equal(samples.length, 11);
  assert.deepEqual(samples.map(s => s.truth).sort((a, b) => a - b), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12']);
  for (const s of samples) {
    assert.equal(s.recognized, s.truth);
    assert.equal(s.needsReview, false);
    assert.ok(s.strokes.every(st => st.every(([x, y]) => Number.isInteger(x) && x >= 0 && y >= 0)), '座標相對於字的左上角');
  }
});

test('一個數字被認錯：位置推算出正確答案，並標記要人工確認', () => {
  // 在 7 的位置寫一個「1」（模擬把 7 寫得像 1、被認成 1）
  const c = SIZE / 2, R = 0.38 * SIZE, h = 0.12 * SIZE, a = (7 * 30 * Math.PI) / 180;
  const strokes = [...buildClock(SIZE, { skip: [7] }), ...writeNumber('1', c + R * Math.sin(a), c - R * Math.cos(a), h)];
  const samples = collectFromClock({ ...analyze(strokes), kind: 'canvas' });
  const at7 = samples.find(s => s.truth === '7');
  assert.ok(at7, '7 的位置有收到');
  assert.equal(at7.recognized, '1');
  assert.equal(at7.needsReview, true);
});

test('兩個數字位置對調：整張不收（避免把位置當答案時標錯）', () => {
  const samples = collectFromClock({ ...analyze(buildClock(SIZE, { moveTo: { 3: 9, 9: 3 } })), kind: 'canvas' });
  assert.equal(samples.length, 0);
});

test('缺很多數字的鐘：整張不收', () => {
  const samples = collectFromClock({ ...analyze(buildClock(SIZE, { skip: [2, 5, 8] })), kind: 'canvas' });
  assert.equal(samples.length, 0);
});

test('儲存：沒開啟不收；開啟後收、重新開啟 App 還在；匯出格式和測試資料相同', async () => {
  const data = new Map();
  const storage = { getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } };
  const store = createSampleStore(storage);
  await store.load();
  const samples = collectFromClock({ ...analyze(buildClock(SIZE)), kind: 'canvas' });
  assert.equal(store.add(samples), 0, '沒開啟收集時不收');
  store.setEnabled(true);
  store.setContributor('  同學B  ');
  assert.equal(store.add(samples), samples.length);
  await store.flush();

  const reopened = createSampleStore(storage);
  await reopened.load();
  assert.equal(reopened.getState().enabled, true);
  assert.equal(reopened.getState().contributor, '同學B');
  const exported = reopened.exportData();
  assert.equal(exported.samples.length, samples.length);
  assert.ok(exported.samples.every(s => typeof s.truth === 'string' && Array.isArray(s.strokes)));

  const stats = sampleStats(exported.samples);
  assert.equal(stats.total, samples.length);
  assert.equal(stats.byTruth[12].count, 1);
  assert.equal(stats.wrong, 0);
  reopened.clear();
  assert.equal(reopened.getState().samples.length, 0);
});

test('匯出的樣本可以直接拿來重新辨識（評估腳本用的就是這個）', async () => {
  const { recognizeSample } = await import('../scripts/cloud-compare-lib.mjs');
  const samples = collectFromClock({ ...analyze(buildClock(SIZE)), kind: 'canvas' });
  for (const s of samples) assert.equal(recognizeSample(JSON.parse(JSON.stringify(s))).digits, s.truth, `樣本 ${s.truth}`);
});
