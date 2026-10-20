// scripts/compare-cloud.mjs
// 比較實驗：同一批手寫數字，分別用「只用手機端」「只用雲端（Google Cloud Vision）」「混合式」辨識，比較準確率。
//
// 執行方式（在專案資料夾）：
//   node scripts/compare-cloud.mjs                      使用 tests/fixtures 的兩個資料集
//   node scripts/compare-cloud.mjs 我的樣本.json         另外加入新的資料集（格式同 tests/fixtures/handwriting.json）
//   node scripts/compare-cloud.mjs --save-images         另外把送給雲端的小圖存到 results/glyphs/，可放進報告
//
// 金鑰：自動讀取 .env.local 的 EXPO_PUBLIC_GOOGLE_VISION_API_KEY。
// 會呼叫 Google（每個字一張圖，內建資料集約 100 張；Vision 每月前 1000 張免費）。
// 結果存到 results/cloud-compare-日期.md（表格可直接貼進報告）與 .json（每個樣本的細節）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { annotateImages } from '../utils/visionApi.js';
import { runComparison, toMarkdown } from './cloud-compare-lib.mjs';

const root = new URL('../', import.meta.url);

function readKey() {
  if (process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY) return process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;
  const env = new URL('.env.local', root);
  if (!existsSync(env)) return '';
  const m = readFileSync(env, 'utf8').match(/^\s*EXPO_PUBLIC_GOOGLE_VISION_API_KEY\s*=\s*(.+?)\s*$/m);
  return m ? m[1].replace(/^["']|["']$/g, '') : '';
}

const args = process.argv.slice(2);
const saveImages = args.includes('--save-images');
const datasets = [
  { name: '手繪截圖', file: new URL('tests/fixtures/handwriting.json', root) },
  { name: '紙本照片', file: new URL('tests/fixtures/photo-digits.json', root) },
  ...args.filter(a => !a.startsWith('--')).map(f => ({ name: basename(f, '.json'), file: f })),
].map(d => ({ name: d.name, samples: JSON.parse(readFileSync(d.file, 'utf8')).samples }));

const apiKey = readKey();
if (!apiKey) {
  console.error('找不到金鑰：請在 .env.local 設定 EXPO_PUBLIC_GOOGLE_VISION_API_KEY=你的金鑰');
  process.exit(1);
}

const outDir = new URL('results/', root);
mkdirSync(outDir, { recursive: true });
let imageNo = 0;

const total = datasets.reduce((n, d) => n + d.samples.length, 0);
console.log(`共 ${total} 個樣本，送 Google Cloud Vision 辨識中…`);

const result = await runComparison(datasets, async images => {
  if (saveImages) {
    mkdirSync(new URL('glyphs/', outDir), { recursive: true });
    for (const b64 of images) writeFileSync(new URL(`glyphs/${String(++imageNo).padStart(3, '0')}.bmp`, outDir), Buffer.from(b64, 'base64'));
  }
  return annotateImages(images, { apiKey });
});

const date = new Date().toISOString().slice(0, 10);
const md = toMarkdown(result, date);
writeFileSync(new URL(`cloud-compare-${date}.md`, outDir), md);
writeFileSync(new URL(`cloud-compare-${date}.json`, outDir), JSON.stringify(result, null, 2));
console.log('\n' + md);
console.log(`已存到 results/cloud-compare-${date}.md`);
console.log('注意：內建的兩個資料集曾用來調整手機端的範本，手機端在這兩組的成績會偏高；' +
  '要公平比較，請再收集其他人的筆跡做成新的資料集一起跑。');
