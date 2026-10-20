// app.config.js
// 讀取 app.json 的設定，只多做一件事：發布到 GitHub Pages 時，網址會多一層「/專案名稱」，
// 由 EXPO_BASE_URL 告訴 Expo（.github/workflows/deploy-web.yml 會自動設定）。
// 平常開發、手機 App 都不受影響。
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
