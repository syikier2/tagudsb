// tests/minicog.test.mjs
// Mini-Cog：詞組、畫鐘 2 分規則（不看指針長短）、總分與切點。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickWordList, recallChoices, scoreClockForMiniCog, scoreMiniCog, WORD_LISTS } from '../utils/miniCog.js';
import { clockSummary, compareWithPrevious, miniCogSummary } from '../utils/resultSummary.js';

const goodClock = { numbersPass: true, hands: { checks: { count: true, direction: true, length: false, centered: true } }, durationSec: 60 };
const words = WORD_LISTS[0].zh;

test('官方 6 組詞，每組 3 個詞，不重複', () => {
  assert.equal(WORD_LISTS.length, 6);
  const all = WORD_LISTS.flatMap(l => l.zh);
  assert.equal(all.length, 18);
  assert.equal(new Set(all).size, 18);
  assert.deepEqual(WORD_LISTS[0].en, ['Banana', 'Sunrise', 'Chair']);
});

test('挑詞組：可以避開上次用過的那組', () => {
  for (let i = 0; i < 50; i++) assert.notEqual(pickWordList(Math.random, 3).version, 3);
});

test('自行作答的選項：9 個詞、包含 3 個正確答案、沒有重複', () => {
  const c = recallChoices(WORD_LISTS[1]);
  assert.equal(c.length, 9);
  assert.equal(new Set(c).size, 9);
  for (const w of WORD_LISTS[1].zh) assert.ok(c.includes(w));
});

test('畫鐘計分：時針比分針長也算正常（Mini-Cog 不看指針長短）', () => {
  assert.equal(scoreClockForMiniCog(goodClock).points, 2);
});

test('畫鐘計分：數字位置不對、指針方向錯、超過三分鐘、沒畫都是 0 分', () => {
  assert.equal(scoreClockForMiniCog({ ...goodClock, numbersPass: false }).points, 0);
  assert.equal(scoreClockForMiniCog({ ...goodClock, hands: { checks: { count: true, direction: false } } }).points, 0);
  assert.equal(scoreClockForMiniCog({ ...goodClock, hands: { checks: { count: false, direction: false } } }).reasons[0], '沒有畫出兩根指針');
  assert.equal(scoreClockForMiniCog({ ...goodClock, durationSec: 200 }).points, 0);
  assert.equal(scoreClockForMiniCog(null).points, 0);
});

test('總分與切點：< 3 陽性、3 分在高敏感度切點以下、5 分陰性', () => {
  const r0 = scoreMiniCog({ recalled: [], words, clock: null });
  assert.equal(r0.total, 0); assert.equal(r0.positive, true);
  const r2 = scoreMiniCog({ recalled: words.slice(0, 2), words, clock: { ...goodClock, numbersPass: false } });
  assert.equal(r2.total, 2); assert.equal(r2.positive, true);
  const r3 = scoreMiniCog({ recalled: words.slice(0, 1), words, clock: goodClock });
  assert.equal(r3.total, 3); assert.equal(r3.positive, false); assert.equal(r3.sensitivePositive, true);
  const r5 = scoreMiniCog({ recalled: words, words, clock: goodClock });
  assert.equal(r5.total, 5); assert.equal(r5.positive, false); assert.equal(r5.sensitivePositive, false);
});

test('三個詞都記得但畫鐘不正常：總分 3，並特別提醒', () => {
  const r = scoreMiniCog({ recalled: words, words, clock: { ...goodClock, numbersPass: false } });
  assert.equal(r.total, 3);
  assert.ok(r.notes.some(n => n.includes('畫鐘不正常')));
});

test('自行作答：選錯的詞不扣分，但會註明；並提醒分數可能偏高', () => {
  const r = scoreMiniCog({ recalled: [words[0], '河流'], words, clock: goodClock, selfAnswered: true });
  assert.equal(r.recall, 1);
  assert.equal(r.wrongPicks, 1);
  assert.ok(r.notes.some(n => n.includes('自行作答')));
});

test('歷史紀錄摘要與和上次比較', () => {
  const s = miniCogSummary(scoreMiniCog({ recalled: words, words, clock: goodClock }), { version: 1, mode: 'examiner' });
  assert.equal(s.type, 'minicog');
  assert.equal(s.total, 5);
  assert.equal(compareWithPrevious([{ type: 'minicog', total: 3 }, { type: 'minicog', total: 5 }]), '總分比上次少 2 分');
  assert.ok(clockSummary); // 原本的摘要仍可使用
});
