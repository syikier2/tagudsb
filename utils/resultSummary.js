// utils/resultSummary.js
// 把測驗結果整理成要存進歷史紀錄的摘要（只存數字與對錯，不存圖片與筆跡）。

/**
 * 畫鐘測驗
 * @param {'canvas'|'photo'} mode
 * @param {{ numbers, numbersPass, hands, contour?, stats?, cloud? }} r
 */
export function clockSummary(mode, r) {
  const items = { numbers: Boolean(r.numbersPass), hands: Boolean(r.hands?.pass) };
  if (mode === 'photo') items.contour = Boolean(r.contour?.pass);
  const total = Object.keys(items).length;
  return {
    type: 'clock',
    mode,
    numberScore: r.numbers.score,
    numberMax: r.numbers.maxScore,
    found: r.numbers.foundCount,
    correct: r.numbers.correctCount,
    missing: r.numbers.missing || [],
    items,
    mocaPassed: Object.values(items).filter(Boolean).length,
    mocaTotal: total,
    durationSec: r.stats?.durationSec ?? null,
    strokes: r.stats?.strokeCount ?? null,
    cloudAsked: r.cloud?.asked ?? null,
  };
}

/** 連線測驗 */
export function trailSummary(a, b, sum, layouts = null) {
  return {
    type: 'trail',
    layoutMode: layouts?.mode ?? 'standard',
    seedA: layouts?.seedA ?? null,
    seedB: layouts?.seedB ?? null,
    completed: a.completed && b.completed,
    aSec: a.durationSec,
    bSec: b.durationSec,
    aErrors: a.errors,
    bErrors: b.errors,
    lifts: a.lifts + b.lifts,
    ratio: sum.ratio,
    mocaPass: sum.mocaPass,
  };
}

/** 和上一次比較的一句話（records：新的在前） */
export function compareWithPrevious(records) {
  const [cur, prev] = records;
  if (!cur || !prev) return null;
  if (cur.type === 'clock') {
    const d = cur.numberScore - prev.numberScore;
    return d === 0 ? '數字分數和上次相同' : `數字分數比上次${d > 0 ? '多' : '少'} ${Math.abs(d)} 分`;
  }
  if (cur.bSec == null || prev.bSec == null) return null;
  const d = cur.bSec - prev.bSec;
  if (Math.abs(d) < 0.5) return 'B 部分時間和上次差不多';
  return `B 部分比上次${d < 0 ? '快' : '慢'} ${Math.abs(d).toFixed(1)} 秒`;
}

const pad = n => String(n).padStart(2, '0');

/** 例如「10/20 22:15」 */
export function shortDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 例如「2026/10/20」 */
export function longDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
