// utils/drawingStats.js
// 作畫過程指標：只供觀察，不計入分數。
// 研究上，作畫時間偏長、停頓較多、反覆修改，可能和認知功能有關，可作為輔助參考。

/**
 * @param {Array} strokes parseStrokes 的結果（點需帶有時間 t）
 * @param {{ startedAt?: number, clears?: number, undos?: number }} session
 *   startedAt：這次測驗第一筆的時間（含之後被清除的筆畫）
 * @returns {null | { durationSec, strokeCount, longestPauseSec, clears, undos }}
 */
export function computeDrawingStats(strokes, session = {}) {
  const timed = strokes.filter(s => s.points.length && Number.isFinite(s.points[0].t));
  if (timed.length === 0) return null;

  const spans = timed
    .map(s => ({ start: s.points[0].t, end: s.points[s.points.length - 1].t }))
    .sort((a, b) => a.start - b.start);

  const first = Number.isFinite(session.startedAt) ? Math.min(session.startedAt, spans[0].start) : spans[0].start;
  const last = Math.max(...spans.map(s => s.end));

  let longestPause = 0;
  for (let i = 1; i < spans.length; i++) {
    longestPause = Math.max(longestPause, spans[i].start - spans[i - 1].end);
  }

  return {
    durationSec: Math.max(0, (last - first) / 1000),
    strokeCount: strokes.length,
    longestPauseSec: Math.max(0, longestPause / 1000),
    clears: session.clears || 0,
    undos: session.undos || 0,
  };
}
