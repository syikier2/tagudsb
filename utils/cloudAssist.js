// utils/cloudAssist.js
// 混合式辨識：手機端為主、雲端為輔。
//
//   1. 手機端（$P 點雲辨識，utils/digitRecognizer.js）先認每一個字，並給出「最像」與「第二像」。
//   2. 只有手機端「沒把握」的字（例如 7 和 9 分數很接近），才把那一個字畫成小圖送 Google Cloud Vision。
//   3. 融合規則：雲端的答案只能在手機端的前兩名之間做選擇——
//        雲端 = 第一名 → 維持（雙方一致）
//        雲端 = 第二名 → 改用雲端的答案
//        雲端說的是別的字、或沒讀到 → 維持手機端的答案
//      這樣雲端把數字誤認成字母、或憑空讀出不相干的字時，不會把原本的結果改壞。
//   4. 沒網路、沒金鑰、Google 回傳錯誤 → 直接用手機端的結果，測驗照常完成。

import { encodeGrayBmpBase64 } from './bmp.js';
import { stampLine } from './strokeClusters.js';

const GLYPH_SIZE = 160;   // 送給雲端的小圖大小（像素）
const GLYPH_HEIGHT = 100; // 字高
const GLYPH_PEN = 5;      // 筆畫粗細（半徑）

/** 把一個字的筆畫畫成白底黑字的小圖（BMP base64） */
export function renderGlyph(strokes) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s.points) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const scale = Math.min(GLYPH_HEIGHT / h, (GLYPH_SIZE - 40) / w);
  const ox = (GLYPH_SIZE - w * scale) / 2, oy = (GLYPH_SIZE - h * scale) / 2;
  const S = GLYPH_SIZE;
  const pixels = new Uint8Array(S * S).fill(255);
  for (const s of strokes) {
    const pts = s.points.map(p => [ox + (p.x - x0) * scale, oy + (p.y - y0) * scale]);
    if (s.unordered || pts.length === 1) {
      // 拍照模式的骨架點沒有順序，逐點蓋章
      for (const [x, y] of pts) stampLine(pixels, S, S, x, y, x, y, GLYPH_PEN);
      continue;
    }
    for (let k = 1; k < pts.length; k++) stampLine(pixels, S, S, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], GLYPH_PEN);
  }
  return encodeGrayBmpBase64(pixels, S, S);
}

// 雲端常把單獨的手寫數字讀成長得像的字母（上學期實測就出現過 N2、ofr、D）
const LOOKALIKE = {
  O: '0', o: '0', D: '0', Q: '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  b: '6', G: '6',
  B: '8',
  g: '9', q: '9',
};

/**
 * 雲端讀到的文字 → 單一數字。
 * 去掉空白與標點後，必須「剛好一個字，而且是數字或長得像數字的字母」才採用；
 * 讀成 N2、ofr 這種夾雜其他字母的結果代表雲端也不確定，回傳 null。
 */
export function textToDigit(text) {
  const chars = [...String(text || '').replace(/[\s.,:;'"`~\-_]/g, '')];
  if (chars.length !== 1) return null;
  const c = chars[0];
  return c >= '0' && c <= '9' ? c : LOOKALIKE[c] || null;
}

/**
 * 融合一個字：手機端的結果 ch（classifyCloud 的回傳值）+ 雲端讀到的數字
 * @returns 新的 ch，多一個 cloud: { digit, outcome }
 *   outcome：'agree' 雙方一致 | 'changed' 改用雲端 | 'ignored' 雲端答案不在前兩名 | 'noAnswer' 雲端沒讀到
 */
export function fuseDigit(ch, cloudDigit) {
  if (cloudDigit == null) return { ...ch, cloud: { digit: null, outcome: 'noAnswer' } };
  if (cloudDigit === ch.digit) return { ...ch, cloud: { digit: cloudDigit, outcome: 'agree' } };
  if (cloudDigit === ch.second) {
    return {
      ...ch, digit: ch.second, second: ch.digit, distance: ch.secondDistance, secondDistance: ch.distance,
      cloud: { digit: cloudDigit, outcome: 'changed' },
    };
  }
  return { ...ch, cloud: { digit: cloudDigit, outcome: 'ignored' } };
}

/**
 * 對整張鐘的辨識結果套用雲端輔助
 * @param {Array} recs recognizeCluster 的結果陣列（每組數字一個）
 * @param {{ ask: (images: string[]) => Promise<string[]>, all?: boolean }} options
 *   ask：送圖給雲端、回傳每張圖讀到的文字（正式使用 = visionApi.annotateImages）
 *   all：true = 每個字都問雲端（比較實驗用）；預設只問沒把握的字
 * @returns {Promise<{ recs, summary: { asked, agree, changed, ignored, noAnswer, error } }>}
 */
export async function refineWithCloud(recs, { ask, all = false }) {
  const summary = { asked: 0, agree: 0, changed: 0, ignored: 0, noAnswer: 0, error: null };
  const jobs = [];
  recs.forEach((rec, r) => rec.chars.forEach((ch, c) => {
    if (all || !ch.confident) jobs.push({ r, c });
  }));
  if (jobs.length === 0) return { recs, summary };

  let texts;
  try {
    texts = await ask(jobs.map(({ r, c }) => renderGlyph(recs[r].groups[c])));
  } catch (e) {
    summary.error = e?.message || String(e);
    return { recs, summary }; // 雲端失敗：維持手機端的結果
  }

  const out = recs.map(rec => ({ ...rec, chars: rec.chars.slice() }));
  jobs.forEach(({ r, c }, k) => {
    const fused = fuseDigit(out[r].chars[c], textToDigit(texts[k]));
    fused.cloud.text = texts[k] || '';
    out[r].chars[c] = fused;
    summary[fused.cloud.outcome] += 1;
  });
  summary.asked = jobs.length;
  for (const rec of out) rec.digits = rec.chars.map(ch => ch.digit).join('');
  return { recs: out, summary };
}

/** 結果畫面上的一句說明 */
export function cloudSummaryText(summary) {
  if (!summary) return '';
  if (summary.error) return `雲端輔助未完成（${summary.error}），本次只用手機端辨識`;
  if (summary.asked === 0) return '手機端每個字都有把握，不需要雲端輔助';
  const parts = [`${summary.agree} 個一致`];
  if (summary.changed) parts.push(`${summary.changed} 個改用雲端答案`);
  if (summary.ignored) parts.push(`${summary.ignored} 個雲端答案不採用`);
  if (summary.noAnswer) parts.push(`${summary.noAnswer} 個雲端沒讀到`);
  return `雲端輔助：${summary.asked} 個沒把握的字送雲端確認（${parts.join('、')}）`;
}
