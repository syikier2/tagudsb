// scripts/build-web.mjs
// 產生網頁版（放到 dist 資料夾，可直接上傳到 Netlify、GitHub Pages 等網站空間）。
//
//   npm run build:web
//
// 網頁的程式碼任何人都看得到，所以這裡刻意「不讀取 .env.local」，
// 確保 Google Cloud Vision 金鑰不會被包進網頁裡；完成後還會再檢查一次 dist 裡有沒有金鑰。

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');

const env = {
  ...process.env,
  EXPO_NO_DOTENV: '1',                     // 不讀 .env / .env.local
  EXPO_PUBLIC_GOOGLE_VISION_API_KEY: '',   // 就算電腦的環境變數有設，也清空
  CI: '1',
};

console.log('產生網頁版中（約 1～2 分鐘）…');
const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], {
  cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32',
});
if (r.status !== 0) {
  console.error('產生失敗，請看上面的錯誤訊息。');
  process.exit(r.status ?? 1);
}

// GitHub Pages：找不到的網址顯示 404.html；.nojekyll 讓 GitHub 不要略過「_expo」這種底線開頭的資料夾
if (existsSync(join(outDir, '+not-found.html'))) copyFileSync(join(outDir, '+not-found.html'), join(outDir, '404.html'));
writeFileSync(join(outDir, '.nojekyll'), '');

// 再檢查一次：dist 裡不能出現 .env.local 的金鑰
const envFile = join(root, '.env.local');
const key = existsSync(envFile)
  ? (readFileSync(envFile, 'utf8').match(/^\s*EXPO_PUBLIC_GOOGLE_VISION_API_KEY\s*=\s*(.+?)\s*$/m)?.[1] || '').replace(/^["']|["']$/g, '')
  : '';
if (key.length >= 10) {
  const walk = dir => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const leaked = walk(outDir).filter(f => /\.(js|html|json|map)$/.test(f) && readFileSync(f, 'utf8').includes(key));
  if (leaked.length) {
    console.error('\n⚠️ 網頁檔案裡出現了 Google 金鑰，請不要上傳！檔案：\n' + leaked.join('\n'));
    process.exit(1);
  }
  console.log('✓ 已確認網頁檔案裡沒有 Google 金鑰');
}
console.log(`\n完成！網頁檔案在 ${outDir}${process.env.EXPO_BASE_URL ? `（網址前綴 ${process.env.EXPO_BASE_URL}）` : ''}\n上傳方式請看 docs/網頁版說明.md`);
