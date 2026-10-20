// utils/clockScoring.js
// 畫鐘測驗評分：同時檢查「數字是否齊全」與「數字位置是否正確」。
// 兩個測驗頁面（手繪 / 拍照）共用這一份邏輯。

export const DISCLAIMER =
  '本結果僅供參考，不能取代醫療診斷。如有記憶或認知方面的疑慮，請諮詢專業醫師。';

// 位置誤差容許角度：相鄰兩個數字相差 30°；超過 22° 就比較靠近隔壁數字的位置，算位置偏移
const ANGLE_TOLERANCE = 22;

// OCR 常把手寫數字讀成長得像的字母，這裡把它們換回數字
const CONFUSABLE = {
  O: '0', o: '0', D: '0',
  I: '1', i: '1', l: '1', L: '1', '|': '1', '!': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6', b: '6',
  B: '8',
  g: '9', q: '9',
};

/** 把一段 OCR 文字轉成純數字字串；含其他字元（如中文、標點以外的字母）就回傳 null */
export function normalizeToken(text) {
  const cleaned = String(text).replace(/[.,:;'"`~\-_()]/g, '');
  if (!cleaned || cleaned.length > 4) return null;
  let out = '';
  for (const ch of cleaned) {
    if (/[0-9]/.test(ch)) out += ch;
    else if (CONFUSABLE[ch]) out += CONFUSABLE[ch];
    else return null;
  }
  return out;
}

/** 從 Vision API 的 boundingPoly 取出外框 */
function boxOf(annotation) {
  const v = annotation.boundingPoly?.vertices || [];
  const xs = v.map(p => p.x || 0);
  const ys = v.map(p => p.y || 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, x1, y0, y1, h: Math.max(1, y1 - y0) };
}

/** OCR 把「12」拆成「1」「2」時，把左右緊鄰的兩組字合併回來 */
function mergeSplitTwoDigits(tokens) {
  const used = new Set();
  const merged = [];
  const sorted = [...tokens].sort((a, b) => a.box.x0 - b.box.x0);
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const a = sorted[i];
    let partner = -1;
    if (a.digits === '1') {
      for (let j = 0; j < sorted.length; j++) {
        if (j === i || used.has(j)) continue;
        const b = sorted[j];
        if (!['0', '1', '2'].includes(b.digits)) continue;
        const h = Math.max(a.box.h, b.box.h);
        const gap = b.box.x0 - a.box.x1;
        const overlap = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
        // 相鄰兩個時鐘數字至少相隔半徑的一半（約四個字高），所以 1.2 個字高以內就代表同一個兩位數
        if (gap > -0.3 * h && gap < 1.2 * h && overlap > 0.5 * Math.min(a.box.h, b.box.h)) {
          partner = j;
          break;
        }
      }
    }
    if (partner >= 0) {
      const b = sorted[partner];
      used.add(i); used.add(partner);
      merged.push({
        digits: a.digits + b.digits,
        box: {
          x0: Math.min(a.box.x0, b.box.x0), x1: Math.max(a.box.x1, b.box.x1),
          y0: Math.min(a.box.y0, b.box.y0), y1: Math.max(a.box.y1, b.box.y1),
          h: Math.max(a.box.h, b.box.h),
        },
      });
    } else {
      used.add(i);
      merged.push(a);
    }
  }
  return merged;
}

/** 把一組數字字串切成時鐘數字，例如 "1112" → [11, 12]，並估算各自的位置 */
function splitIntoClockNumbers(token) {
  const { digits, box } = token;
  const parts = [];
  if (digits.length === 2) {
    // 兩位數只接受 10~12；其他（例如 45、50）多半是誤讀，直接捨棄
    const v = parseInt(digits, 10);
    if (v >= 10 && v <= 12) parts.push({ n: v, start: 0, len: 2 });
  } else {
    let i = 0;
    while (i < digits.length) {
      const two = parseInt(digits.slice(i, i + 2), 10);
      const one = parseInt(digits[i], 10);
      if (digits.length - i >= 2 && two >= 10 && two <= 12) {
        parts.push({ n: two, start: i, len: 2 });
        i += 2;
      } else if (one >= 1 && one <= 9) {
        parts.push({ n: one, start: i, len: 1 });
        i += 1;
      } else {
        return []; // 切不乾淨（含多餘的 0）就整組捨棄，避免把雜訊當成數字
      }
    }
  }

  const charW = (box.x1 - box.x0) / digits.length;
  return parts.map(p => ({
    n: p.n,
    x: box.x0 + charW * (p.start + p.len / 2),
    y: (box.y0 + box.y1) / 2,
  }));
}

/** 角度：以 12 點方向為 0°，順時針增加（影像座標 y 軸向下） */
function angleOf(x, y, cx, cy) {
  let a = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

const MAX_ROTATION = 30; // 照片旋轉校正的上限（度）

/** a 相對於 b 的角度差，範圍 -180 ~ 180 */
function signedDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * 主要評分函式
 * @param {Array} textAnnotations Vision API 回傳的 textAnnotations
 * @param {Object} options
 *   imageWidth, imageHeight：影像尺寸，用來取得圓心
 *   centerMode：'image' = 用影像中心當圓心（手繪模式，圓圈固定在畫布中央）
 *               'auto'  = 用數字分布的中心（拍照模式，紙上的鐘不一定在正中央）
 */
export function scoreClock(textAnnotations, options = {}) {
  // 取出每一組字（[0] 是整段文字，跳過）
  const tokens = (textAnnotations || [])
    .slice(1)
    .map(a => ({ digits: normalizeToken(a.description), box: boxOf(a) }))
    .filter(t => t.digits);
  return scoreTokens(tokens, options);
}

/**
 * 依「已知位置的數字」評分。手繪模式用筆畫座標直接建立 tokens，不必依賴 OCR 回報的位置。
 * @param {Array<{digits: string, box: {x0,x1,y0,y1,h}}>} tokens
 * @param {Object} options 同 scoreClock，另外可直接給 centerX / centerY
 */
export function scoreTokens(tokens, options = {}) {
  const { imageWidth, imageHeight, centerMode = 'auto', centerX, centerY, correctRotation = false } = options;

  // 合併被拆開的兩位數，再切出 1~12
  const candidates = mergeSplitTwoDigits(tokens).flatMap(splitIntoClockNumbers);

  // 決定圓心
  const hasImageSize = imageWidth > 0 && imageHeight > 0;
  let cx, cy;
  const distinct = new Set(candidates.map(c => c.n)).size;
  if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
    cx = centerX;
    cy = centerY;
  } else if (centerMode === 'auto' && distinct >= 6) {
    const xs = candidates.map(c => c.x), ys = candidates.map(c => c.y);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  } else if (hasImageSize) {
    cx = imageWidth / 2;
    cy = imageHeight / 2;
  } else if (candidates.length) {
    const xs = candidates.map(c => c.x), ys = candidates.map(c => c.y);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }

  // 拍照模式：照片可能拍歪，先估計整體旋轉角度（各數字偏差的中位數）再扣掉
  let rotation = 0;
  if (correctRotation) {
    const closest = new Map();
    for (const c of candidates) {
      const d = signedDiff(angleOf(c.x, c.y, cx, cy), (c.n % 12) * 30);
      if (Math.abs(d) <= 45 && (!closest.has(c.n) || Math.abs(d) < Math.abs(closest.get(c.n)))) closest.set(c.n, d);
    }
    const diffs = [...closest.values()].sort((a, b) => a - b);
    if (diffs.length >= 4) {
      const mid = diffs.length >> 1;
      const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
      rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, median));
    }
  }

  // 4. 每個數字算角度；同一個數字出現多次時，保留位置最接近的那一個
  const best = new Map();
  for (const c of candidates) {
    const angle = (angleOf(c.x, c.y, cx, cy) - rotation + 360) % 360;
    const error = angleDiff(angle, (c.n % 12) * 30);
    const prev = best.get(c.n);
    if (!prev || error < prev.error) best.set(c.n, { n: c.n, angle, error, rawAngle: angleOf(c.x, c.y, cx, cy) });
  }

  const numbers = [];
  for (let n = 1; n <= 12; n++) {
    const hit = best.get(n);
    numbers.push({
      n,
      status: !hit ? 'missing' : hit.error <= ANGLE_TOLERANCE ? 'correct' : 'misplaced',
      angleError: hit ? Math.round(hit.error) : null,
      rawAngle: hit ? hit.rawAngle : null, // 實際畫的位置（未校正旋轉），指針評分用
    });
  }

  const found = numbers.filter(x => x.status !== 'missing');
  const correct = numbers.filter(x => x.status === 'correct');
  const missing = numbers.filter(x => x.status === 'missing').map(x => x.n);
  const misplaced = numbers.filter(x => x.status === 'misplaced').map(x => x.n);

  // 5. 計分（滿分 5）：齊全度佔 1 分、位置正確佔 4 分，依比例計算後無條件捨去。
  //    只有 12 個數字都在正確位置才會拿滿分；任何缺漏或偏移都會反映在分數上。
  const raw = (found.length / 12) * 1 + (correct.length / 12) * 4;
  const score = Math.floor(raw + 1e-9);

  let summary;
  if (found.length === 0) summary = '沒有辨識到任何 1～12 的數字。請把數字寫大、寫清楚後再試一次。';
  else if (score >= 5) summary = '數字齊全，位置也都正確，表現良好！';
  else if (score === 4) summary = '大致完整，有少數數字缺漏或位置偏移。';
  else if (score === 3) summary = '有明顯的數字缺漏或位置偏移，建議定期追蹤。';
  else summary = '數字缺漏或位置偏移較多，建議諮詢專業醫師做進一步評估。';

  const details = [];
  if (found.length > 0 && missing.length) details.push(`未辨識到：${missing.join('、')}`);
  if (misplaced.length) details.push(`位置偏移：${misplaced.join('、')}`);

  return {
    score,
    maxScore: 5,
    foundCount: found.length,
    correctCount: correct.length,
    numbers,
    missing,
    misplaced,
    summary,
    details,
    rotation: Math.round(rotation), // 拍照模式校正的旋轉角度（度）
  };
}
