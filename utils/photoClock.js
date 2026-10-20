// utils/photoClock.js
// 拍照模式的完整流程：照片 → 筆跡 → 分組 → 辨識 → 評分。
// 和手繪模式共用同一套分組（strokeClusters）、辨識（digitRecognizer）、評分（clockScoring / handsScoring）。

import { scoreTokens } from './clockScoring.js';
import { recognizeCluster } from './digitRecognizer.js';
import { scoreHands, targetsFromNumbers } from './handsScoring.js';
import { cloudSummaryText, refineWithCloud } from './cloudAssist.js';
import { analyzePhoto } from './photoAnalysis.js';
import { clusterStrokes, renderSheet } from './strokeClusters.js';

const ROTATE_AGAIN_ABOVE = 6; // 估計照片歪超過 6° 時，把筆跡轉正後再辨識一次

function recognizeAll(clusters, canvas, recs = clusters.map(c => recognizeCluster(c))) {
  const readings = [];
  const tokens = [];
  let unsure = 0;
  clusters.forEach((c, i) => {
    const rec = recs[i];
    unsure += rec.chars.filter(ch => !ch.confident && ch.cloud?.outcome !== 'agree' && ch.cloud?.outcome !== 'changed').length;
    readings.push({ id: c.id, rec });
    tokens.push({ digits: rec.digits, box: { ...c.box, h: Math.max(1, c.box.y1 - c.box.y0) } });
  });
  const numbers = scoreTokens(tokens, {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
    correctRotation: true, // 照片可能拍歪
  });
  return { numbers, readings, unsure, recs };
}

function rotateStrokes(strokes, canvas, deg) {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return strokes.map(s => ({
    ...s,
    points: s.points.map(p => ({
      x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
      y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
    })),
  }));
}

/**
 * @param {string} base64 JPEG（建議寬約 1000px）
 * @param {{ ask?: Function }} options ask：有給的話，手機端沒把握的字會送雲端確認（見 utils/cloudAssist.js）
 */
export async function analyzePhotoClock(base64, options = {}) {
  const photo = analyzePhoto(base64, options);
  const { canvas } = photo;

  let strokes = photo.strokes;
  let grouped = clusterStrokes(strokes, canvas);
  let pass = recognizeAll(grouped.clusters, canvas);

  // 照片拍歪時，數字本身也是歪的，會影響辨識（例如 6 和 9 就是靠方向分辨的）。
  // 先用第一次的結果估計歪了幾度，把筆跡轉正後再辨識一次，取比較好的結果。
  let rotation = pass.numbers.rotation;
  if (Math.abs(rotation) > ROTATE_AGAIN_ABOVE) {
    const straightened = rotateStrokes(strokes, canvas, -rotation);
    const grouped2 = clusterStrokes(straightened, canvas);
    const pass2 = recognizeAll(grouped2.clusters, canvas);
    const better =
      pass2.numbers.correctCount > pass.numbers.correctCount ||
      (pass2.numbers.correctCount === pass.numbers.correctCount && pass2.numbers.foundCount > pass.numbers.foundCount);
    if (better) {
      strokes = straightened;
      grouped = grouped2;
      pass = pass2;
      rotation += pass2.numbers.rotation;
    }
  }

  // 雲端輔助：只在最後一次辨識結果上做，避免重複送圖
  let cloud = null;
  if (options.ask) {
    const refined = await refineWithCloud(pass.recs, { ask: options.ask });
    cloud = refined.summary;
    pass = recognizeAll(grouped.clusters, canvas, refined.recs); // 用融合後的結果重新評分
  }

  // 指針以受測者自己寫的數字位置為準（和數字在同一個座標系，照片歪掉也不影響）
  const hands = scoreHands(grouped.handStrokes, canvas, undefined,
    targetsFromNumbers(pass.numbers.numbers, undefined, pass.numbers.rotation));
  if (pass.unsure > 0) pass.numbers.details.push(`有 ${pass.unsure} 個字的筆跡不太確定，建議寫得更清楚一點`);
  if (cloud) pass.numbers.details.push(cloudSummaryText(cloud));
  if (Math.abs(rotation) >= 3) pass.numbers.details.push(`照片大約歪了 ${Math.abs(Math.round(rotation))}°，已自動校正`);

  const numbersPass = pass.numbers.numbers.every(n => n.status !== 'missing' && n.angleError <= 45);

  return {
    numbers: pass.numbers,
    numbersPass,
    hands,
    contour: photo.contour,
    cloud,
    debug: {
      binaryPreview: photo.binaryPreview,
      sheet: renderSheet(grouped.clusters),
      readings: pass.readings,
      ignored: grouped.ignored,
    },
  };
}
