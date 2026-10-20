// constants/theme.js
// 全 App 共用的顏色、字級、間距。設計方向：給長輩用 —— 大字、高對比、按鈕好按、顏色溫和不刺眼。

export const colors = {
  bg: '#F5F3EE',        // 米白底，比純白不刺眼
  surface: '#FFFFFF',
  surfaceAlt: '#FAF8F4',
  line: '#E6E1D8',
  ink: '#1E2A32',       // 主要文字
  inkSoft: '#55626B',   // 次要文字
  inkFaint: '#8B959C',  // 說明、免責聲明

  primary: '#2D6A7A',   // 主色：沉穩的藍綠
  primaryDark: '#22525F',
  primarySoft: '#E2EEF0',

  good: '#2E7D4F',
  goodSoft: '#E4F2E9',
  warn: '#A8640A',
  warnSoft: '#FBF0DC',
  partial: '#D99A3D',   // 部分通過（趨勢圖）
  bad: '#B3362F',
  badSoft: '#F8E4E2',
  neutralSoft: '#EEF0F1',
};

// 每個測驗一個代表色（首頁卡片、結果分數）
export const accents = {
  canvas: '#2D6A7A',
  photo: '#B5622B',
  trail: '#4F5FA8',
  history: '#6B5B8C',
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  hero: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  body: { fontSize: 17, color: colors.ink, lineHeight: 26 },
  small: { fontSize: 15, color: colors.inkSoft, lineHeight: 22 },
  caption: { fontSize: 13, color: colors.inkFaint, lineHeight: 19 },
};

export const shadow = {
  elevation: 2,
  shadowColor: '#3B2F1E',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
};
