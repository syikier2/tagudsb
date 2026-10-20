// tests/profiles.test.mjs
// 受測者資料與歷史紀錄：新增、切換、刪除、存檔後重新開啟 App 還在。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ageOf, createProfileStore, educationBonus, profileSubtitle, validateProfile,
} from '../utils/profileStore.js';
import { clockSummary, compareWithPrevious, trailSummary } from '../utils/resultSummary.js';

/** 模擬手機的儲存空間 */
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: async k => (data.has(k) ? data.get(k) : null),
    setItem: async (k, v) => { data.set(k, v); },
  };
}

const NOW = new Date('2026-10-20T12:00:00');
const grandma = { name: '王阿嬤', birthYear: '1948', education: 'elementary', sex: 'female' };

test('資料檢查：姓名必填、出生年要合理', () => {
  assert.deepEqual(validateProfile(grandma, NOW), []);
  assert.match(validateProfile({ name: '  ' }, NOW)[0], /姓名/);
  assert.match(validateProfile({ name: 'A', birthYear: '48' }, NOW)[0], /出生年/);
  assert.match(validateProfile({ name: 'A', birthYear: '2030' }, NOW)[0], /出生年/);
  assert.deepEqual(validateProfile({ name: 'A', birthYear: '' }, NOW), [], '出生年可以不填');
});

test('年齡、副標題、MoCA 教育加分', () => {
  const p = { ...grandma, birthYear: 1948 };
  assert.equal(ageOf(p, NOW), 78);
  assert.equal(profileSubtitle(p, NOW), '78 歲・女・國小');
  assert.equal(educationBonus(p), 1);
  assert.equal(educationBonus({ education: 'senior' }), 0);
  assert.equal(educationBonus({}), 0, '沒填教育程度不加分');
});

test('新增受測者會自動選為目前受測者；重新開啟 App 資料還在', async () => {
  const storage = memoryStorage();
  const store = createProfileStore(storage);
  await store.load();
  const p = store.addProfile(grandma);
  assert.equal(store.getState().activeId, p.id);
  assert.equal(p.birthYear, 1948);
  store.addResult({ type: 'clock', numberScore: 4 });
  await store.flush();

  const reopened = createProfileStore(storage);
  await reopened.load();
  assert.equal(reopened.getState().profiles[0].name, '王阿嬤');
  assert.equal(reopened.activeProfile().id, p.id);
  assert.equal(reopened.resultsFor(p.id).length, 1);
});

test('紀錄只存到目前的受測者；沒有選擇受測者時不儲存', async () => {
  const store = createProfileStore(memoryStorage());
  await store.load();
  assert.equal(store.addResult({ type: 'clock' }), null);
  const a = store.addProfile({ name: '甲' });
  const b = store.addProfile({ name: '乙' });
  store.addResult({ type: 'clock', numberScore: 5 }, new Date('2026-10-01'));
  store.setActive(a.id);
  store.addResult({ type: 'trail' }, new Date('2026-10-02'));
  store.addResult({ type: 'clock', numberScore: 3 }, new Date('2026-10-03'));
  assert.equal(store.resultsFor(b.id).length, 1);
  assert.equal(store.resultsFor(a.id).length, 2);
  assert.equal(store.resultsFor(a.id, 'clock').length, 1);
  assert.equal(store.resultsFor(a.id)[0].numberScore, 3, '新的在前');
});

test('刪除受測者會一併刪除他的紀錄', async () => {
  const store = createProfileStore(memoryStorage());
  await store.load();
  const a = store.addProfile({ name: '甲' });
  store.addResult({ type: 'clock' });
  const b = store.addProfile({ name: '乙' });
  store.addResult({ type: 'clock' });
  store.deleteProfile(b.id);
  assert.equal(store.getState().activeId, null);
  assert.equal(store.getState().results.length, 1);
  assert.equal(store.getState().results[0].profileId, a.id);
});

test('儲存的資料壞掉時從空白開始，不會讓 App 當掉', async () => {
  const storage = memoryStorage();
  const store = createProfileStore(storage);
  storage.data.set(store.STORAGE_KEY, '{壞掉的 JSON');
  await store.load();
  assert.deepEqual(store.getState().profiles, []);
});

test('測驗摘要：畫鐘（手繪 2 項、拍照 3 項）與連線', () => {
  const numbers = { score: 4, maxScore: 5, foundCount: 12, correctCount: 10, missing: [] };
  const canvas = clockSummary('canvas', { numbers, numbersPass: true, hands: { pass: false }, stats: { durationSec: 95, strokeCount: 30 } });
  assert.equal(canvas.mocaTotal, 2);
  assert.equal(canvas.mocaPassed, 1);
  assert.equal(canvas.durationSec, 95);
  const photo = clockSummary('photo', { numbers, numbersPass: true, hands: { pass: true }, contour: { pass: true } });
  assert.equal(photo.mocaTotal, 3);
  assert.equal(photo.mocaPassed, 3);

  const t = trailSummary(
    { completed: true, durationSec: 20, errors: 0, lifts: 1 },
    { completed: true, durationSec: 50, errors: 1, lifts: 0 },
    { ratio: 2.5, mocaPass: false },
  );
  assert.equal(t.lifts, 1);
  assert.equal(t.ratio, 2.5);
});

test('和上次比較', () => {
  assert.equal(compareWithPrevious([{ type: 'clock', numberScore: 5 }, { type: 'clock', numberScore: 3 }]), '數字分數比上次多 2 分');
  assert.equal(compareWithPrevious([{ type: 'trail', bSec: 40 }, { type: 'trail', bSec: 45.2 }]), 'B 部分比上次快 5.2 秒');
  assert.equal(compareWithPrevious([{ type: 'clock', numberScore: 5 }]), null);
});
