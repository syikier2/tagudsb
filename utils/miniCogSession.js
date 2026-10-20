// utils/miniCogSession.js
// Mini-Cog 進行中的狀態（跨畫面共用）：記詞頁 → 手繪畫鐘頁 → 回想頁。只存在記憶體中。
let session = null;

/** 開始新的一次 Mini-Cog */
export function startMiniCog(list, mode) {
  session = { list, mode, startedAt: Date.now(), learnTrials: 0, clock: null };
  return session;
}

export const getMiniCog = () => session;

export function updateMiniCog(patch) {
  if (session) session = { ...session, ...patch };
  return session;
}

export function endMiniCog() {
  session = null;
}
