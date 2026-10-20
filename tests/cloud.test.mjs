// tests/cloud.test.mjs
// 混合式辨識：雲端只在手機端沒把握時給第二意見，而且不能把結果改壞。
// 這裡不會真的連到 Google，用假的雲端回應測試融合規則。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudSummaryText, fuseDigit, refineWithCloud, renderGlyph, textToDigit } from '../utils/cloudAssist.js';
import { recognizeCluster } from '../utils/digitRecognizer.js';
import { analyzePhotoClock } from '../utils/photoClock.js';
import { annotateImages, VisionError } from '../utils/visionApi.js';
import { readFileSync } from 'node:fs';
import { densify, GLYPHS } from './helpers.mjs';

const unsure7 = { digit: '7', second: '9', distance: 2, secondDistance: 2.1, confident: false, byLoop: false };

test('雲端讀到的文字轉成數字：長得像的字母也算，讀到兩個字以上不算', () => {
  assert.equal(textToDigit('7\n'), '7');
  assert.equal(textToDigit('O'), '0');
  assert.equal(textToDigit('l'), '1');
  assert.equal(textToDigit('S.'), '5');
  assert.equal(textToDigit('N2'), null);  // 夾雜其他字母 = 雲端也不確定
  assert.equal(textToDigit('12'), null);
  assert.equal(textToDigit('ofr'), null);
  assert.equal(textToDigit(''), null);
});

test('融合規則：雲端 = 第一名維持、= 第二名改用、其他答案或沒讀到都不採用', () => {
  assert.equal(fuseDigit(unsure7, '7').digit, '7');
  assert.equal(fuseDigit(unsure7, '7').cloud.outcome, 'agree');
  const changed = fuseDigit(unsure7, '9');
  assert.equal(changed.digit, '9');
  assert.equal(changed.second, '7');
  assert.equal(changed.cloud.outcome, 'changed');
  assert.equal(fuseDigit(unsure7, '4').digit, '7');
  assert.equal(fuseDigit(unsure7, '4').cloud.outcome, 'ignored');
  assert.equal(fuseDigit(unsure7, null).cloud.outcome, 'noAnswer');
});

function rec(chars) {
  const stroke = { points: densify(GLYPHS[7][0], { scale: 40 }) };
  return { digits: chars.map(c => c.digit).join(''), chars, groups: chars.map(() => [stroke]) };
}

test('只有沒把握的字會送雲端，有把握的字不送', async () => {
  const sure1 = { digit: '1', second: '7', distance: 1, secondDistance: 3, confident: true, byLoop: false };
  let sent = 0;
  const { recs, summary } = await refineWithCloud([rec([sure1, unsure7])], {
    ask: async imgs => { sent = imgs.length; return ['9']; },
  });
  assert.equal(sent, 1);
  assert.equal(recs[0].digits, '19');
  assert.equal(summary.changed, 1);
  assert.match(cloudSummaryText(summary), /1 個改用雲端答案/);
});

test('每個字都有把握時完全不連雲端', async () => {
  const sure = { digit: '3', second: '5', distance: 1, secondDistance: 3, confident: true, byLoop: false };
  const { summary } = await refineWithCloud([rec([sure])], { ask: async () => assert.fail('不應該呼叫雲端') });
  assert.equal(summary.asked, 0);
});

test('雲端失敗（沒網路、金鑰錯誤）：維持手機端結果，並說明原因', async () => {
  const input = [rec([unsure7])];
  const { recs, summary } = await refineWithCloud(input, { ask: async () => { throw new VisionError('無法連線到 Google（可能沒有網路）'); } });
  assert.equal(recs[0].digits, '7');
  assert.match(cloudSummaryText(summary), /只用手機端辨識/);
});

test('送給雲端的小圖：160×160 的 BMP，字在中間', () => {
  const b64 = renderGlyph([{ points: densify(GLYPHS[2][0], { scale: 40 }) }]);
  const buf = Buffer.from(b64, 'base64');
  assert.equal(buf.toString('latin1', 0, 2), 'BM');
  assert.equal(buf.readInt32LE(18), 160);
  assert.equal(buf.readInt32LE(22), 160);
});

test('recognizeCluster 會附上每個字的筆畫（雲端輔助要用）', () => {
  let ox = 0;
  const strokes = [];
  for (const ch of '12') {
    for (const pl of GLYPHS[ch]) strokes.push({ points: densify(pl, { scale: 40, ox }) });
    ox += 30;
  }
  const r = recognizeCluster({ strokes });
  assert.equal(r.groups.length, 2);
});

test('呼叫 Google：超過 16 張自動分批；單張失敗只算沒讀到', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.requests.length);
    return {
      ok: true, status: 200,
      json: async () => ({ responses: body.requests.map((_, i) => (i === 0 ? { error: { message: 'bad image' } } : { fullTextAnnotation: { text: '5' } })) }),
    };
  };
  const texts = await annotateImages(Array(20).fill('AAAA'), { apiKey: 'test', fetchImpl: fakeFetch });
  assert.deepEqual(calls, [16, 4]);
  assert.equal(texts.length, 20);
  assert.equal(texts[0], '');
  assert.equal(texts[1], '5');
});

test('呼叫 Google：沒有金鑰、帳單錯誤都會丟出看得懂的錯誤', async () => {
  await assert.rejects(annotateImages(['A'], { apiKey: '' }), /尚未設定 API 金鑰/);
  const billing = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Billing disabled' } }) });
  await assert.rejects(annotateImages(['A'], { apiKey: 'k', fetchImpl: billing }), /Billing disabled/);
});

test('拍照模式接上雲端：雲端每次都同意，結果和只用手機端一樣', async () => {
  const jpg = readFileSync(new URL('./fixtures/photo-clock-2.jpg', import.meta.url)).toString('base64');
  const local = await analyzePhotoClock(jpg);
  const unsureDigits = [];
  for (const r of local.debug.readings) for (const ch of r.rec.chars) if (!ch.confident) unsureDigits.push(ch.digit);
  let i = 0;
  const hybrid = await analyzePhotoClock(jpg, { ask: async imgs => imgs.map(() => unsureDigits[i++]) });
  assert.equal(hybrid.numbers.score, local.numbers.score);
  assert.equal(hybrid.cloud.asked, unsureDigits.length);
  assert.equal(hybrid.cloud.agree, unsureDigits.length);
});

test('比較實驗：計算三種方式的準確率（假的雲端：每個字都讀成 7）', async () => {
  const { runComparison, toMarkdown } = await import('../scripts/cloud-compare-lib.mjs');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/handwriting.json', import.meta.url), 'utf8'));
  const ds = [{ name: '手繪截圖', samples: fixture.samples }];
  const { rows } = await runComparison(ds, async imgs => imgs.map(() => '7'));
  const r = rows[0];
  assert.equal(r.samples, 50);
  assert.equal(r.local, 50);                  // 手機端在這組全對
  const sevens = fixture.samples.filter(s => s.truth === '7').length;
  assert.equal(r.cloud, sevens);              // 只用雲端：只有真的是 7 的樣本對
  assert.equal(r.changedRight, 0);            // 手機端本來就全對，沒有可以改對的字
  assert.ok(r.hybrid >= r.local - r.changedWrong, '混合式最多只會在「改用雲端但改錯」的字上出錯');
  assert.ok(r.hybrid > r.cloud, '雲端亂答時，混合式仍遠好於只用雲端');
  assert.match(toMarkdown({ rows, details: [] }), /只用手機端/);
});
