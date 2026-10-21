// utils/sampleCollect.js
// 辨識樣本收集（開發用，不影響評分）：
// 一張「畫得好」的鐘，每個數字寫在哪個位置，就代表它應該是哪個數字（寫在 3 點鐘方向的就是 3）。
// 所以不用人工標註，就能把每個數字的筆跡連同正確答案存下來，匯出後用來檢查、改進辨識。
//
// 為了不把錯的答案存進來，只收：
//   1. 整張鐘夠完整：至少 11 個數字被認出、而且在正確位置（最多只容許 1 個例外）。
//      兩個數字位置對調會讓正確數變成 10，就整張不收，避免把位置當答案時標錯。
//   2. 這個數字離某個鐘點的位置夠近（12° 以內；相鄰鐘點相差 30°）
//   3. 同一個鐘點只有一組筆跡（兩組搶同一個位置就都不收）
// 注意：只建議收集自願者（同學、家人）寫的鐘，不要收集正式篩檢的受測者。

export const MIN_FOUND = 11;
export const MIN_CORRECT = 11;
export const MAX_SLOT_ERROR = 12;
const MAX_POINTS_PER_STROKE = 150;

const angleDiff = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * 依位置推算每一組筆跡的正確答案
 * @param clusters strokeClusters.clusterStrokes 的 clusters（有 angle：從圓心看的角度，12 點方向 = 0°）
 * @param recs     每一組的 recognizeCluster 結果（順序同 clusters）
 * @param scored   scoreTokens 的結果（用來判斷整張鐘夠不夠完整、照片旋轉角度）
 * @returns {Array<{ cluster, rec, truth, slotError }>} 可以收的組
 */
export function labelByPosition(clusters, recs, scored) {
  if (!scored || scored.foundCount < MIN_FOUND || scored.correctCount < MIN_CORRECT) return [];
  const rotation = scored.rotation || 0;
  const items = clusters.map((cluster, i) => {
    const angle = (cluster.angle - rotation + 360) % 360;
    const slot = Math.round(angle / 30) % 12;
    return { cluster, rec: recs[i], truth: String(slot === 0 ? 12 : slot), slotError: angleDiff(angle, slot * 30) };
  });
  const perSlot = new Map();
  for (const it of items) perSlot.set(it.truth, (perSlot.get(it.truth) || 0) + 1);
  return items.filter(it => it.slotError <= MAX_SLOT_ERROR && perSlot.get(it.truth) === 1);
}

/** 點太多時平均挑一部分（拍照模式的骨架點很多） */
function thin(points) {
  if (points.length <= MAX_POINTS_PER_STROKE) return points;
  const step = points.length / MAX_POINTS_PER_STROKE;
  return Array.from({ length: MAX_POINTS_PER_STROKE }, (_, i) => points[Math.floor(i * step)]);
}

/**
 * 轉成和 tests/fixtures/handwriting.json 相同的樣本格式
 * 座標改成相對於這組字的左上角（不保留在畫布上的位置），並取整數
 * @param {'canvas'|'photo'} kind canvas = 有筆畫順序；photo = 照片骨架，點沒有順序
 */
export function toSamples(labeled, { kind, contributor = '', at = new Date() } = {}) {
  const stamp = at.toISOString();
  return labeled.map(({ cluster, rec, truth }) => {
    const { x0, y0 } = cluster.box;
    const strokes = cluster.strokes.map(s => thin(s.points).map(p => [Math.round(p.x - x0), Math.round(p.y - y0)]));
    const sample = {
      source: `${contributor || '未命名'} ${stamp.slice(0, 10)} ${kind === 'photo' ? '拍照' : '手繪'}`,
      truth,
      kind,
      strokes,
      recognized: rec.digits,
      confident: rec.chars.every(c => c.confident),
      // 當時認的和位置推算的不一樣：可能是認錯（最有價值的樣本），也可能是寫錯位置，加進測試前請人工看一下
      needsReview: rec.digits !== truth,
      contributor,
      at: stamp,
    };
    if (kind === 'photo') sample.loops = cluster.strokes.map(s => Boolean(s.loop));
    return sample;
  });
}

/** 一張鐘可以收集的樣本（不符合條件時是空陣列） */
export function collectFromClock({ clusters, recs, scored, kind, contributor, at }) {
  return toSamples(labelByPosition(clusters, recs, scored), { kind, contributor, at });
}

// ---- 儲存（和 profileStore 一樣，儲存方式由外部提供，方便測試）---------------------

const STORAGE_KEY = 'tagusb.samples.v1';
const MAX_SAMPLES = 1000; // 全部存在同一筆資料裡；Android 單筆資料太大（約 2MB 以上）會存不進去

export function createSampleStore(storage) {
  let state = { enabled: false, contributor: '', samples: [], loaded: false };
  const listeners = new Set();
  let saving = Promise.resolve();

  const set = next => {
    state = { ...next, loaded: true };
    listeners.forEach(fn => fn());
    const { enabled, contributor, samples } = state;
    saving = saving
      .then(() => storage.setItem(STORAGE_KEY, JSON.stringify({ enabled, contributor, samples })))
      .catch(e => console.warn('儲存樣本失敗', e));
  };

  return {
    STORAGE_KEY,
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    flush: () => saving,

    async load() {
      let saved = null;
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('讀取樣本失敗，從空白開始', e);
      }
      state = {
        enabled: Boolean(saved?.enabled),
        contributor: typeof saved?.contributor === 'string' ? saved.contributor : '',
        samples: Array.isArray(saved?.samples) ? saved.samples : [],
        loaded: true,
      };
      listeners.forEach(fn => fn());
      return state;
    },

    setEnabled(on) { set({ ...state, enabled: Boolean(on) }); },
    setContributor(name) { set({ ...state, contributor: String(name || '').trim().slice(0, 20) }); },

    /** 收集一張鐘的樣本；沒開啟收集時不做事。回傳收了幾個 */
    add(samples) {
      if (!state.enabled || !samples.length) return 0;
      set({ ...state, samples: [...state.samples, ...samples].slice(-MAX_SAMPLES) });
      return samples.length;
    },

    clear() { set({ ...state, samples: [] }); },

    /** 匯出成 tests/fixtures 的格式 */
    exportData(now = new Date()) {
      return {
        description:
          '辨識樣本收集匯出（依數字在鐘面上的位置推算正確答案）。truth = 正確答案；recognized = 當時手機端認成什麼；' +
          'kind = canvas（有筆畫順序）或 photo（照片骨架，點沒有順序）。',
        exportedAt: now.toISOString(),
        samples: state.samples,
      };
    },
  };
}

/** 統計：每個數字收了幾個、當時認錯幾個 */
export function sampleStats(samples) {
  const byTruth = {};
  for (let n = 1; n <= 12; n++) byTruth[n] = { count: 0, wrong: 0 };
  let wrong = 0, unsure = 0;
  const contributors = new Set();
  for (const s of samples) {
    const t = byTruth[s.truth];
    if (t) { t.count += 1; if (s.recognized !== s.truth) t.wrong += 1; }
    if (s.recognized !== s.truth) wrong += 1;
    if (!s.confident) unsure += 1;
    contributors.add(s.contributor || '未命名');
  }
  return { total: samples.length, wrong, unsure, byTruth, contributors: contributors.size };
}
