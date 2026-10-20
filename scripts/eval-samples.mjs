// scripts/eval-samples.mjs
// 用目前的辨識程式，重新辨識收集到的樣本，算出準確率（不需要網路）。
//
//   node scripts/eval-samples.mjs samples-2026-10-21.json [更多檔案…]
//   node scripts/eval-samples.mjs                         沒給檔案時，評估 tests/fixtures 的兩組資料
//
// 會列出：整體準確率、每個數字的準確率、每位志願者的準確率、認錯的樣本。
// 改了範本（utils/digitRecognizer.js）之後再跑一次，就知道是變好還是變差。

import { readFileSync } from 'node:fs';
import { recognizeSample } from './cloud-compare-lib.mjs';

const files = process.argv.slice(2);
const inputs = files.length
  ? files
  : ['tests/fixtures/handwriting.json', 'tests/fixtures/photo-digits.json'].map(f => new URL(`../${f}`, import.meta.url));

const all = [];
for (const f of inputs) {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  for (const s of data.samples) all.push(s);
}
if (!all.length) { console.log('沒有樣本'); process.exit(0); }

const pct = (a, n) => (n ? `${((100 * a) / n).toFixed(1)}%` : '-');
const rows = all.map(s => {
  const rec = recognizeSample(s);
  return { s, got: rec.digits, ok: rec.digits === s.truth, unsure: rec.chars.some(c => !c.confident) };
});

const ok = rows.filter(r => r.ok).length;
console.log(`\n共 ${rows.length} 個樣本，認對 ${ok} 個（${pct(ok, rows.length)}）；其中 ${rows.filter(r => r.unsure).length} 個手機端沒把握\n`);

const group = (key) => {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    const g = m.get(k) || { n: 0, ok: 0 };
    g.n += 1; g.ok += r.ok ? 1 : 0;
    m.set(k, g);
  }
  return m;
};

console.log('| 數字 | 樣本數 | 準確率 |\n| --- | --- | --- |');
for (const [k, g] of [...group(r => r.s.truth)].sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`| ${k} | ${g.n} | ${pct(g.ok, g.n)} |`);

const people = group(r => r.s.contributor || r.s.source?.split(' ')[0] || '未命名');
if (people.size > 1) {
  console.log('\n| 志願者 | 樣本數 | 準確率 |\n| --- | --- | --- |');
  for (const [k, g] of people) console.log(`| ${k} | ${g.n} | ${pct(g.ok, g.n)} |`);
}

const wrong = rows.filter(r => !r.ok);
if (wrong.length) {
  console.log('\n認錯的樣本：');
  for (const r of wrong.slice(0, 50)) console.log(`  ${r.s.source}：「${r.s.truth}」被認成「${r.got}」${r.s.needsReview ? '（收集時就認錯，請確認筆跡）' : ''}`);
  if (wrong.length > 50) console.log(`  …還有 ${wrong.length - 50} 個`);
}
