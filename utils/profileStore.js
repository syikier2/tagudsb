// utils/profileStore.js
// 受測者資料與歷史紀錄（只存在這支手機裡，不上傳）。
// 和儲存方式分開：App 用 AsyncStorage（utils/profiles.js），自動測試用記憶體（tests/profiles.test.mjs）。
//
// 資料格式（存成一份 JSON）：
//   profiles: [{ id, name, birthYear, education, sex, createdAt }]
//   activeId: 目前選擇的受測者
//   results:  [{ id, profileId, at, type: 'clock' | 'trail', ...測驗摘要 }]

const STORAGE_KEY = 'tagusb.profiles.v1';
const MAX_RESULTS_PER_PROFILE = 200; // 每位受測者最多保留的紀錄數，超過時刪除最舊的

export const EDUCATION = [
  { key: 'none', label: '未受正規教育', years: 0 },
  { key: 'elementary', label: '國小', years: 6 },
  { key: 'junior', label: '國中', years: 9 },
  { key: 'senior', label: '高中職', years: 12 },
  { key: 'college', label: '大專以上', years: 16 },
];

export const SEX = [
  { key: 'male', label: '男' },
  { key: 'female', label: '女' },
  { key: 'unspecified', label: '不透露' },
];

const EMPTY = { profiles: [], activeId: null, results: [] };

let idCounter = 0;
const newId = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 檢查受測者資料，回傳錯誤訊息（沒問題回傳空陣列） */
export function validateProfile(p, now = new Date()) {
  const errors = [];
  const name = (p.name || '').trim();
  if (!name) errors.push('請輸入姓名或暱稱');
  if (name.length > 20) errors.push('姓名或暱稱最多 20 個字');
  if (p.birthYear != null && p.birthYear !== '') {
    const y = Number(p.birthYear);
    if (!Number.isInteger(y) || y < 1900 || y > now.getFullYear()) errors.push(`出生年請輸入 1900～${now.getFullYear()} 的西元年`);
  }
  if (p.education && !EDUCATION.some(e => e.key === p.education)) errors.push('教育程度不正確');
  if (p.sex && !SEX.some(s => s.key === p.sex)) errors.push('性別不正確');
  return errors;
}

export function ageOf(profile, now = new Date()) {
  return profile?.birthYear ? now.getFullYear() - Number(profile.birthYear) : null;
}

/** 例如「78 歲・女・國小」 */
export function profileSubtitle(profile, now = new Date()) {
  if (!profile) return '';
  const age = ageOf(profile, now);
  return [
    age != null && `${age} 歲`,
    SEX.find(s => s.key === profile.sex && s.key !== 'unspecified')?.label,
    EDUCATION.find(e => e.key === profile.education)?.label,
  ].filter(Boolean).join('・');
}

/** MoCA 規則：教育 6 年以下，總分加 1 分 */
export const educationBonus = profile => {
  const e = EDUCATION.find(x => x.key === profile?.education);
  return e != null && e.years <= 6 ? 1 : 0;
};

function cleanProfile(p) {
  return {
    name: p.name.trim(),
    birthYear: p.birthYear === '' || p.birthYear == null ? null : Number(p.birthYear),
    education: p.education || null,
    sex: p.sex || null,
  };
}

/**
 * 從 results 陣列挑出某位受測者的紀錄，新的在前。
 * 畫面上請用這個（傳入 useProfiles() 的 state.results），資料改變時畫面才會跟著更新。
 */
export function resultsOf(results, profileId, type = null) {
  return results
    .filter(r => r.profileId === profileId && (!type || r.type === type))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** 所有受測者的畫鐘紀錄（人工評分用），新的在前 */
export function clockResultsOf(results) {
  return results.filter(r => r.type === 'clock').sort((a, b) => (a.at < b.at ? 1 : -1));
}

/**
 * @param {{ getItem(key): Promise<string|null>, setItem(key, value): Promise<void> }} storage
 */
export function createProfileStore(storage, { onRemoveResults = () => {} } = {}) {
  let state = { ...EMPTY, rater: '', loaded: false };
  const listeners = new Set();
  let saving = Promise.resolve();

  const emit = () => listeners.forEach(fn => fn());
  const set = next => {
    state = { ...next, loaded: true };
    emit();
    const { profiles, activeId, results, rater } = state;
    // 依序寫入，避免較舊的內容蓋掉較新的
    saving = saving.then(() => storage.setItem(STORAGE_KEY, JSON.stringify({ profiles, activeId, results, rater }))).catch(e => {
      console.warn('儲存受測者資料失敗', e);
    });
  };

  return {
    STORAGE_KEY,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** 等待資料寫入完成（測試用） */
    flush: () => saving,

    async load() {
      let saved = null;
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('讀取受測者資料失敗，從空白開始', e);
      }
      state = {
        profiles: Array.isArray(saved?.profiles) ? saved.profiles : [],
        activeId: saved?.activeId ?? null,
        results: Array.isArray(saved?.results) ? saved.results : [],
        rater: typeof saved?.rater === 'string' ? saved.rater : '',
        loaded: true,
      };
      if (state.activeId && !state.profiles.some(p => p.id === state.activeId)) state.activeId = null;
      emit();
      return state;
    },

    activeProfile: () => state.profiles.find(p => p.id === state.activeId) || null,

    addProfile(input) {
      const errors = validateProfile(input);
      if (errors.length) throw new Error(errors.join('；'));
      const profile = { id: newId(), ...cleanProfile(input), createdAt: new Date().toISOString() };
      set({ ...state, profiles: [...state.profiles, profile], activeId: profile.id });
      return profile;
    },

    updateProfile(id, input) {
      const errors = validateProfile(input);
      if (errors.length) throw new Error(errors.join('；'));
      set({ ...state, profiles: state.profiles.map(p => (p.id === id ? { ...p, ...cleanProfile(input) } : p)) });
    },

    /** 刪除受測者，連同他的所有紀錄 */
    deleteProfile(id) {
      onRemoveResults(state.results.filter(r => r.profileId === id).map(r => r.id));
      set({
        ...state,
        profiles: state.profiles.filter(p => p.id !== id),
        results: state.results.filter(r => r.profileId !== id),
        activeId: state.activeId === id ? null : state.activeId,
      });
    },

    setActive(id) {
      if (id !== null && !state.profiles.some(p => p.id === id)) return;
      set({ ...state, activeId: id });
    },

    /**
     * 把一次測驗結果存到目前的受測者
     * @returns 存好的紀錄；沒有選擇受測者時回傳 null（不儲存）
     */
    addResult(summary, at = new Date()) {
      const profileId = state.activeId;
      if (!profileId) return null;
      const record = { id: newId(), profileId, at: at.toISOString(), ...summary };
      let results = [...state.results, record];
      const mine = results.filter(r => r.profileId === profileId);
      if (mine.length > MAX_RESULTS_PER_PROFILE) {
        const drop = new Set(mine.slice(0, mine.length - MAX_RESULTS_PER_PROFILE).map(r => r.id));
        onRemoveResults([...drop]);
        results = results.filter(r => !drop.has(r.id));
      }
      set({ ...state, results });
      return record;
    },

    deleteResult(id) {
      onRemoveResults([id]);
      set({ ...state, results: state.results.filter(r => r.id !== id) });
    },

    /** 標記這筆紀錄有沒有保存畫鐘圖（給人工評分看） */
    setHasDrawing(id, has = true) {
      set({ ...state, results: state.results.map(r => (r.id === id ? { ...r, hasDrawing: has } : r)) });
    },

    // ---- 人工評分 ----
    setRater(name) { set({ ...state, rater: String(name || '').trim().slice(0, 20) }); },

    /** 存一位評分者對一筆紀錄的評分（同一位評分者再評一次會覆蓋） */
    addRating(resultId, rating) {
      const rater = String(rating.rater || '').trim();
      if (!rater) throw new Error('請先輸入評分者代號');
      const entry = { ...rating, rater, at: new Date().toISOString() };
      set({
        ...state,
        results: state.results.map(r =>
          r.id === resultId ? { ...r, ratings: [...(r.ratings || []).filter(x => x.rater !== rater), entry] } : r
        ),
      });
    },

    /** 所有受測者的畫鐘紀錄（人工評分用），新的在前 */
    allClockResults() {
      return clockResultsOf(state.results);
    },

    /** 某位受測者的紀錄，新的在前 */
    resultsFor(profileId, type = null) {
      return resultsOf(state.results, profileId, type);
    },
  };
}
