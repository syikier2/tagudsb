// utils/handsScoring.js
// 指針評分，參考 MoCA（蒙特利爾認知評估）畫鐘題的「指針」項目：
//   - 要有兩根指針，一起指出正確的時間
//   - 時針要明顯比分針短
//   - 指針要從鐘面中心出發
// 預設題目時間是 11 點 10 分（MoCA 常用的題目），可修改 TARGET_TIME。

export const TARGET_TIME = { hour: 11, minute: 10 };

const ANGLE_TOLERANCE = 20;   // 指針方向容許誤差（度）
const MIN_RAY_RATIO = 0.07;   // 從中心往外至少要畫畫布的 7%（約鐘面半徑的 15%）長，才算一根指針；時針常常畫得很短
const SAME_RAY_ANGLE = 12;    // 兩段方向差在這以內，視為同一根指針（例如描了兩次）
const SHORTER_RATIO = 0.85;   // 時針長度要小於分針的 85%，才算「明顯比較短」
const MAX_JUNCTION_RATIO = 0.15; // 指針交會點離圓心不能超過畫布 15%

/** 目標時間對應的角度（12 點方向為 0°，順時針） */
export function targetAngles({ hour, minute } = TARGET_TIME) {
  return {
    hour: ((hour % 12) * 30 + minute * 0.5) % 360,
    minute: (minute * 6) % 360,
  };
}

function angleOf(x, y, ox, oy) {
  let a = (Math.atan2(x - ox, oy - y) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 角度 → 「約幾點方向」 */
export function clockPosition(angle) {
  const n = Math.round(angle / 30) % 12;
  return n === 0 ? 12 : n;
}

/**
 * 從指針筆畫找出「射線」：每一筆以最靠近圓心的點為起點，往兩端各找最遠的點。
 * 這樣分開畫的兩根指針、或一筆畫成 V 字的兩根指針都能處理。
 */
export function extractRays(handStrokes, { width, height }) {
  const size = Math.min(width, height);
  const cx = width / 2, cy = height / 2;
  const rays = [];
  for (const s of handStrokes) {
    const pts = s.points;
    let pivot = 0, best = Infinity;
    pts.forEach((p, i) => {
      const r = Math.hypot(p.x - cx, p.y - cy);
      if (r < best) { best = r; pivot = i; }
    });
    const origin = pts[pivot];
    if (s.unordered) {
      // 拍照模式：骨架點沒有順序，改成依「從起點看過去的方向」把點分群，每一群是一根指針
      rays.push(...raysFromUnordered(pts, origin, size));
      continue;
    }
    for (const part of [pts.slice(0, pivot + 1), pts.slice(pivot)]) {
      let far = null, farD = 0;
      for (const p of part) {
        const d = Math.hypot(p.x - origin.x, p.y - origin.y);
        if (d > farD) { farD = d; far = p; }
      }
      if (far && farD >= MIN_RAY_RATIO * size) {
        rays.push({ angle: angleOf(far.x, far.y, origin.x, origin.y), length: farD, origin });
      }
    }
  }
  // 同一個方向畫了兩次 → 只留最長的
  rays.sort((a, b) => b.length - a.length);
  const merged = [];
  for (const r of rays) {
    if (!merged.some(m => angleDiff(m.angle, r.angle) <= SAME_RAY_ANGLE)) merged.push(r);
  }
  return merged;
}

/** 沒有順序的點：依方向分群（相鄰方向差超過 25° 就是另一根），每群取最遠的點 */
function raysFromUnordered(pts, origin, size) {
  const far = pts
    .map(p => ({ p, d: Math.hypot(p.x - origin.x, p.y - origin.y) }))
    .filter(o => o.d >= 0.05 * size)
    .map(o => ({ ...o, a: angleOf(o.p.x, o.p.y, origin.x, origin.y) }))
    .sort((a, b) => a.a - b.a);
  if (!far.length) return [];
  // 從最大的空隙切開，避免一根指針剛好跨過 0° 被切成兩半
  let cut = 0, biggest = -1;
  for (let i = 0; i < far.length; i++) {
    const gap = (far[(i + 1) % far.length].a - far[i].a + 360) % 360 || (far.length === 1 ? 360 : 0);
    if (gap > biggest) { biggest = gap; cut = (i + 1) % far.length; }
  }
  const ordered = [...far.slice(cut), ...far.slice(0, cut)];
  const groups = [[ordered[0]]];
  for (let i = 1; i < ordered.length; i++) {
    const gap = (ordered[i].a - ordered[i - 1].a + 360) % 360;
    if (gap > 25) groups.push([]);
    groups[groups.length - 1].push(ordered[i]);
  }
  const rays = [];
  for (const g of groups) {
    const tip = g.reduce((m, o) => (o.d > m.d ? o : m));
    if (tip.d >= MIN_RAY_RATIO * size) rays.push({ angle: tip.a, length: tip.d, origin });
  }
  return rays;
}

/**
 * @returns {{ pass, rays, hour, minute, checks: {count, direction, length, centered}, messages: string[] }}
 */
/**
 * 指針應該指的方向：以「受測者自己寫的數字位置」為準（人工評分也是這樣看：時針有沒有指向他寫的 11、
 * 分針有沒有指向他寫的 2）。找不到那個數字時，才用標準鐘面的角度（並扣掉照片的旋轉）。
 * @param numbers clockScoring 結果的 numbers（含 rawAngle）
 */
export function targetsFromNumbers(numbers, target = TARGET_TIME, rotation = 0) {
  const ideal = targetAngles(target);
  const at = n => numbers?.find(x => x.n === n && x.rawAngle != null)?.rawAngle;
  const h = target.hour % 12 || 12, next = (h % 12) + 1;
  let hour = (ideal.hour + rotation + 360) % 360;
  const aH = at(h), aNext = at(next);
  if (aH != null) {
    const span = aNext != null ? ((aNext - aH + 540) % 360) - 180 : 30; // 這個數字到下一個數字的角度
    hour = (aH + span * (target.minute / 60) + 360) % 360;
  }
  let minute = (ideal.minute + rotation + 360) % 360;
  const minuteNumber = target.minute / 5;
  if (Number.isInteger(minuteNumber) && minuteNumber >= 1 && at(minuteNumber) != null) minute = at(minuteNumber);
  return { hour, minute };
}

export function scoreHands(handStrokes, canvas, target = TARGET_TIME, wantAngles = null) {
  const size = Math.min(canvas.width, canvas.height);
  const rays = extractRays(handStrokes, canvas);
  const want = wantAngles || targetAngles(target);
  const timeText = `${target.hour} 點 ${target.minute} 分`;
  const messages = [];
  const checks = { count: false, direction: false, length: false, centered: false };

  if (rays.length === 0) {
    messages.push(`沒有偵測到指針。請從中心畫出兩根指針，指向 ${timeText}。`);
    return { pass: false, rays, hour: null, minute: null, checks, messages };
  }

  checks.count = rays.length === 2;
  if (!checks.count) messages.push(`指針應該要有 2 根，偵測到 ${rays.length} 根。`);

  // 找出最接近時針、分針方向的兩根
  let hour = null, minute = null;
  if (rays.length >= 2) {
    let bestCost = Infinity;
    for (const h of rays) {
      for (const m of rays) {
        if (h === m) continue;
        const cost = angleDiff(h.angle, want.hour) + angleDiff(m.angle, want.minute);
        if (cost < bestCost) { bestCost = cost; hour = h; minute = m; }
      }
    }
  } else {
    const r = rays[0];
    if (angleDiff(r.angle, want.hour) <= angleDiff(r.angle, want.minute)) hour = r;
    else minute = r;
  }

  checks.direction =
    !!hour && !!minute &&
    angleDiff(hour.angle, want.hour) <= ANGLE_TOLERANCE &&
    angleDiff(minute.angle, want.minute) <= ANGLE_TOLERANCE;
  if (!checks.direction) {
    const seen = rays.map(r => `${clockPosition(r.angle)} 點`).join('、');
    messages.push(`指針沒有指出 ${timeText}（偵測到指向約 ${seen} 方向）。`);
  }

  // 方向對了才檢查長短；方向錯的時候，無法確定哪一根是時針
  checks.length = checks.direction && hour.length < SHORTER_RATIO * minute.length;
  if (checks.direction && !checks.length) messages.push('時針應該明顯比分針短。');

  const cx = canvas.width / 2, cy = canvas.height / 2;
  checks.centered = rays.every(r => Math.hypot(r.origin.x - cx, r.origin.y - cy) <= MAX_JUNCTION_RATIO * size);
  if (!checks.centered) messages.push('指針應該從鐘面中心出發。');

  const pass = checks.count && checks.direction && checks.length && checks.centered;
  if (pass) messages.push(`兩根指針正確指出 ${timeText}，時針比分針短。`);
  return { pass, rays, hour, minute, checks, messages };
}
