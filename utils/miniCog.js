// utils/miniCog.js
// Mini-Cog 快速篩檢：三個詞的記憶 ＋ 畫鐘（Borson 等，2000；標準化版本 mini-cog.com）。
//
//   1. 記詞：唸三個詞，請受測者複誦，最多試三次
//   2. 畫鐘：在預先畫好的圓圈裡寫上所有數字，再把指針畫成 11 點 10 分（三分鐘內）
//   3. 回想：請受測者說出剛才的三個詞，不給提示
//
//   計分：回想每個詞 1 分（0～3）＋ 畫鐘正常 2 分、不正常 0 分 ＝ 總分 0～5
//   畫鐘「正常」：所有數字依序、位置大致正確，指針指向 11 和 2（指針長短不計分）
//   判讀：總分 < 3 是已驗證的失智症篩檢切點；需要更高敏感度時用 < 4
//
// Mini-Cog © S. Borson。官方表格註明僅限臨床與教育用途，未經作者同意不得修改或用於商業、研究。
// 中文詞語為本專題翻譯，不是官方版本。

// 官方 6 組詞（英文原文 ＋ 本專題的中文翻譯）
export const WORD_LISTS = [
  { version: 1, en: ['Banana', 'Sunrise', 'Chair'], zh: ['香蕉', '日出', '椅子'] },
  { version: 2, en: ['Leader', 'Season', 'Table'], zh: ['領袖', '季節', '桌子'] },
  { version: 3, en: ['Village', 'Kitchen', 'Baby'], zh: ['村莊', '廚房', '嬰兒'] },
  { version: 4, en: ['River', 'Nation', 'Finger'], zh: ['河流', '國家', '手指'] },
  { version: 5, en: ['Captain', 'Garden', 'Picture'], zh: ['船長', '花園', '圖畫'] },
  { version: 6, en: ['Daughter', 'Heaven', 'Mountain'], zh: ['女兒', '天堂', '高山'] },
];

export const MAX_LEARN_TRIALS = 3;
export const CLOCK_TIME_LIMIT_SEC = 180;
export const CUTOFF = 3;            // 總分 < 3：已驗證的失智症篩檢切點
export const SENSITIVE_CUTOFF = 4;  // 總分 < 4：需要更高敏感度時使用

/** 隨機挑一組詞（rand 可以換成固定的亂數，方便測試） */
export function pickWordList(rand = Math.random, avoidVersion = null) {
  const pool = WORD_LISTS.filter(l => l.version !== avoidVersion);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

/**
 * 「自行作答」用的選項：3 個正確的詞 ＋ 6 個其他組的詞，打散
 * （官方是不給提示的自由回想；選擇題比較容易，分數只能參考，結果頁會註明）
 */
export function recallChoices(list, rand = Math.random) {
  const others = WORD_LISTS.filter(l => l.version !== list.version).flatMap(l => l.zh);
  const picked = [];
  const pool = [...others];
  while (picked.length < 6 && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const all = [...list.zh, ...picked];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/**
 * Mini-Cog 的畫鐘計分（和 MoCA 不同：不看指針長短、不看輪廓）
 * @param {{ numbersPass, hands, durationSec }} clock 手繪畫鐘的結果
 */
export function scoreClockForMiniCog(clock) {
  if (!clock) return { points: 0, normal: false, reasons: ['沒有完成畫鐘'] };
  const reasons = [];
  if (!clock.numbersPass) reasons.push('數字沒有全部依序寫在大致正確的位置');
  if (!clock.hands?.checks?.count) reasons.push('沒有畫出兩根指針');
  else if (!clock.hands?.checks?.direction) reasons.push('指針沒有指向 11 和 2');
  if (clock.durationSec != null && clock.durationSec > CLOCK_TIME_LIMIT_SEC) reasons.push('超過三分鐘才完成');
  const normal = reasons.length === 0;
  return { points: normal ? 2 : 0, normal, reasons };
}

/**
 * 總分與判讀
 * @param {{ recalled: string[], words: string[], clock, selfAnswered: boolean }}
 */
export function scoreMiniCog({ recalled, words, clock, selfAnswered = false }) {
  const recall = words.filter(w => recalled.includes(w)).length;
  const wrongPicks = recalled.filter(w => !words.includes(w)).length;
  const c = scoreClockForMiniCog(clock);
  const total = recall + c.points;
  const positive = total < CUTOFF;
  const sensitivePositive = total < SENSITIVE_CUTOFF;
  const notes = [];
  if (positive) notes.push(`總分 ${total} 分，低於 ${CUTOFF} 分：篩檢結果為陽性，建議找醫師做進一步的認知評估。`);
  else if (sensitivePositive) notes.push(`總分 ${total} 分：高於失智症篩檢切點，但低於高敏感度切點（${SENSITIVE_CUTOFF} 分），可以考慮進一步評估或定期追蹤。`);
  else notes.push(`總分 ${total} 分：篩檢結果為陰性。`);
  if (recall === 3 && !c.normal) notes.push('三個詞都記得，但畫鐘不正常；畫鐘反映的是規劃與空間能力，仍值得留意。');
  if (selfAnswered) notes.push('本次是「自行作答」（從選項中選詞），比官方的自由回想容易，分數可能偏高，僅供參考。');
  if (wrongPicks > 0) notes.push(`選了 ${wrongPicks} 個沒有出現過的詞。`);
  return { recall, clockPoints: c.points, clockNormal: c.normal, clockReasons: c.reasons, total, positive, sensitivePositive, wrongPicks, notes };
}
