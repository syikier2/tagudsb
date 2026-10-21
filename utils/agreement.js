// utils/agreement.js
// 評分一致性：App 的評分和人工評分一不一致、兩位評分者之間一不一致。
//
// 每一張畫鐘評這幾項（都是「通過 / 不通過」，照 MoCA 與 Mini-Cog 的規則）：
//   contour       輪廓（只有拍照模式）
//   numbers       數字：1～12 都有、位置大致正確
//   hands         指針（MoCA）：兩根、指向 11 點 10 分、時針較短、從中心出發
//   minicogClock  Mini-Cog 畫鐘正常：數字依序、位置大致正確，指針指向 11 和 2（不看長短）
//
// 統計量：
//   一致率 = 兩邊判斷相同的張數 / 總張數
//   Cohen's kappa = (一致率 − 碰巧一致的機率) / (1 − 碰巧一致的機率)，扣掉「亂猜也會一樣」的部分
//   判讀參考 Landis & Koch (1977)：< 0 差、0～0.2 輕微、0.21～0.4 尚可、0.41～0.6 中等、0.61～0.8 高度、0.81～1 幾乎完全一致

export const ITEMS = [
  { key: 'contour', label: '輪廓', photoOnly: true },
  { key: 'numbers', label: '數字（MoCA）' },
  { key: 'hands', label: '指針（MoCA）' },
  { key: 'minicogClock', label: '畫鐘正常（Mini-Cog）' },
];

/** App 對一筆畫鐘紀錄的判斷（舊紀錄缺的欄位回傳 null） */
export function appJudgement(record) {
  const it = record.items || {};
  const handsBasic = record.handsCount != null && record.handsDirection != null ? record.handsCount && record.handsDirection : null;
  return {
    contour: record.mode === 'photo' ? Boolean(it.contour) : null,
    numbers: it.numbers ?? null,
    hands: it.hands ?? null,
    minicogClock: handsBasic == null || it.numbers == null ? null : Boolean(it.numbers && handsBasic),
  };
}

/**
 * Cohen's kappa（兩個評分來源、二元判斷）
 * @param {Array<[boolean, boolean]>} pairs
 * @returns {{ n, agree, percent, kappa }} kappa 無法計算時為 null（例如兩邊全部都判「通過」）
 */
export function cohenKappa(pairs) {
  const n = pairs.length;
  if (!n) return { n: 0, agree: 0, percent: null, kappa: null };
  let agree = 0, aYes = 0, bYes = 0;
  for (const [a, b] of pairs) {
    if (a === b) agree += 1;
    if (a) aYes += 1;
    if (b) bYes += 1;
  }
  const po = agree / n;
  const pe = (aYes / n) * (bYes / n) + (1 - aYes / n) * (1 - bYes / n);
  const kappa = pe >= 1 ? null : (po - pe) / (1 - pe);
  return { n, agree, percent: po, kappa };
}

export function kappaLabel(k) {
  if (k == null) return '無法計算';
  if (k < 0) return '差';
  if (k <= 0.2) return '輕微';
  if (k <= 0.4) return '尚可';
  if (k <= 0.6) return '中等';
  if (k <= 0.8) return '高度';
  return '幾乎完全一致';
}

/**
 * 整理所有紀錄的一致性
 * @param {Array} records 畫鐘紀錄（type === 'clock'），每筆可能有 ratings: [{ rater, numbers, hands, contour, minicogClock }]
 * @returns {{ raters, appVsRater: [{ rater, item, ...kappa }], raterVsRater: [{ a, b, item, ...kappa }], ratedCount }}
 */
export function computeAgreement(records) {
  const rated = records.filter(r => r.type === 'clock' && r.ratings?.length);
  const raters = [...new Set(rated.flatMap(r => r.ratings.map(x => x.rater)))].sort();
  const appVsRater = [];
  for (const rater of raters) {
    for (const item of ITEMS) {
      const pairs = [];
      for (const r of rated) {
        const app = appJudgement(r)[item.key];
        const human = r.ratings.find(x => x.rater === rater)?.[item.key];
        if (app != null && human != null) pairs.push([app, human]);
      }
      if (pairs.length) appVsRater.push({ rater, item: item.key, label: item.label, ...cohenKappa(pairs) });
    }
  }
  const raterVsRater = [];
  for (let i = 0; i < raters.length; i++) {
    for (let j = i + 1; j < raters.length; j++) {
      for (const item of ITEMS) {
        const pairs = [];
        for (const r of rated) {
          const a = r.ratings.find(x => x.rater === raters[i])?.[item.key];
          const b = r.ratings.find(x => x.rater === raters[j])?.[item.key];
          if (a != null && b != null) pairs.push([a, b]);
        }
        if (pairs.length) raterVsRater.push({ a: raters[i], b: raters[j], item: item.key, label: item.label, ...cohenKappa(pairs) });
      }
    }
  }
  return { raters, appVsRater, raterVsRater, ratedCount: rated.length };
}

/** 匯出成 CSV（Excel 可以直接開）：每一列 = 一張畫鐘 × 一位評分者 */
export function agreementCsv(records) {
  const yn = v => (v == null ? '' : v ? 1 : 0);
  const head = ['紀錄編號', '日期', '模式', ...ITEMS.map(i => `App_${i.key}`), '評分者', ...ITEMS.map(i => `人工_${i.key}`)];
  const lines = [head.join(',')];
  for (const r of records.filter(x => x.type === 'clock' && x.ratings?.length)) {
    const app = appJudgement(r);
    for (const rt of r.ratings) {
      lines.push([r.id, r.at.slice(0, 10), r.mode, ...ITEMS.map(i => yn(app[i.key])), `"${String(rt.rater).replace(/"/g, '""')}"`, ...ITEMS.map(i => yn(rt[i.key]))].join(','));
    }
  }
  return '﻿' + lines.join('\n') + '\n'; // ﻿ 讓 Excel 正確顯示中文
}
