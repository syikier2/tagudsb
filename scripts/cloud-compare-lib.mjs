// scripts/cloud-compare-lib.mjs
// 比較實驗的計算部分（和網路分開，方便用假的雲端回應做自動測試）。

import { refineWithCloud, renderGlyph, textToDigit } from '../utils/cloudAssist.js';
import { recognizeCluster } from '../utils/digitRecognizer.js';

/**
 * fixtures 的樣本格式 → recognizeCluster 結果
 * kind = 'canvas'（App 收集的手繪樣本）有筆畫順序；其他（截圖、照片骨架）點沒有順序
 */
export function recognizeSample(sample) {
  const ordered = sample.kind === 'canvas';
  const strokes = sample.strokes.map((s, i) => ({
    points: s.map(([x, y]) => ({ x, y })),
    ...(ordered ? {} : { loop: Boolean(sample.loops?.[i]), unordered: true }),
  }));
  return recognizeCluster({ strokes });
}

/**
 * @param {Array<{name, samples}>} datasets
 * @param {(images: string[]) => Promise<string[]>} ask 送圖給雲端
 * @returns {Promise<{ rows, details }>}
 */
export async function runComparison(datasets, ask) {
  const rows = [];
  const details = [];
  for (const ds of datasets) {
    const recs = ds.samples.map(recognizeSample);
    // 每個字都問一次雲端（「只用雲端」需要全部的答案）；混合式只會用到沒把握的那些
    const images = recs.flatMap(r => r.groups.map(g => renderGlyph(g)));
    const texts = await ask(images);

    let k = 0;
    const row = {
      dataset: ds.name, samples: ds.samples.length, chars: images.length,
      local: 0, cloud: 0, hybrid: 0, cloudNoAnswer: 0,
      unsure: 0, agree: 0, changedRight: 0, changedWrong: 0, ignored: 0, noAnswer: 0,
    };
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i], truth = ds.samples[i].truth;
      const myTexts = rec.chars.map(() => texts[k++] ?? '');
      const cloudDigits = myTexts.map(textToDigit);
      const cloudOnly = cloudDigits.map(d => d ?? '?').join('');
      row.cloudNoAnswer += cloudDigits.filter(d => d == null).length;

      const unsureTexts = myTexts.filter((_, c) => !rec.chars[c].confident);
      const { recs: [hyb], summary } = await refineWithCloud([rec], { ask: async () => unsureTexts });

      row.local += rec.digits === truth ? 1 : 0;
      row.cloud += cloudOnly === truth ? 1 : 0;
      row.hybrid += hyb.digits === truth ? 1 : 0;
      row.unsure += summary.asked;
      row.agree += summary.agree;
      row.ignored += summary.ignored;
      row.noAnswer += summary.noAnswer;
      hyb.chars.forEach((ch, c) => {
        if (ch.cloud?.outcome !== 'changed') return;
        if (ch.digit === truth[c]) row.changedRight += 1; else row.changedWrong += 1;
      });
      details.push({
        dataset: ds.name, source: ds.samples[i].source, truth,
        local: rec.digits, cloud: cloudOnly, cloudText: myTexts, hybrid: hyb.digits,
        unsure: rec.chars.map(ch => !ch.confident),
      });
    }
    rows.push(row);
  }
  return { rows, details };
}

const pct = (a, n) => (n ? `${a}/${n}（${((100 * a) / n).toFixed(1)}%）` : '-');

/** 結果寫成 Markdown（可以直接貼進報告） */
export function toMarkdown({ rows, details }, date = new Date().toISOString().slice(0, 10)) {
  const lines = [
    `# 手機端 vs 雲端 vs 混合式 辨識比較（${date}）`,
    '',
    '以「整個樣本完全認對」計算（例如 12 要兩個字都對）。',
    '',
    '| 資料集 | 樣本數 | 只用手機端 | 只用雲端 | 混合式（本專題） |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(r => `| ${r.dataset} | ${r.samples} | ${pct(r.local, r.samples)} | ${pct(r.cloud, r.samples)} | ${pct(r.hybrid, r.samples)} |`),
    '',
    '## 混合式的細節（只統計手機端沒把握、有送雲端的字）',
    '',
    '| 資料集 | 總字數 | 雲端完全沒讀到數字 | 手機端沒把握 | 雙方一致 | 改用雲端且改對 | 改用雲端但改錯 | 雲端答案不採用 | 雲端沒讀到 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(r => `| ${r.dataset} | ${r.chars} | ${r.cloudNoAnswer} | ${r.unsure} | ${r.agree} | ${r.changedRight} | ${r.changedWrong} | ${r.ignored} | ${r.noAnswer} |`),
    '',
    '## 認錯的樣本',
    '',
    '| 資料集 | 來源 | 正確答案 | 手機端 | 雲端（原始文字） | 混合式 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...details
      .filter(d => d.local !== d.truth || d.cloud !== d.truth || d.hybrid !== d.truth)
      .map(d => `| ${d.dataset} | ${d.source} | ${d.truth} | ${d.local} | ${d.cloud}（${d.cloudText.map(t => JSON.stringify(t.trim())).join(' ')}） | ${d.hybrid} |`),
  ];
  return lines.join('\n') + '\n';
}
