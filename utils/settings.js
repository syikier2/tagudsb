// utils/settings.js
// App 設定：「雲端輔助辨識」開關、連線測驗版面。
// 預設關閉；使用者在首頁同意後才開啟。存在記憶體中，App 重新啟動後回到關閉（保守的預設值）。

import { Platform } from 'react-native';
import { VISION_API_KEY } from './visionApi.js';

// 網頁版的程式碼任何人都看得到，金鑰包在裡面等於公開，所以網頁版預設不提供雲端輔助。
// 若已在 Google Cloud 把金鑰限制為只有自己的網址能用，可在 .env.local 加上 EXPO_PUBLIC_ALLOW_WEB_CLOUD=1 開啟。
export const isWeb = Platform.OS === 'web';
const webCloudAllowed = process.env.EXPO_PUBLIC_ALLOW_WEB_CLOUD === '1';

let cloudAssist = false;
const listeners = new Set();

/** 有沒有設定 Google Cloud Vision 金鑰（沒有就不能開啟雲端輔助） */
export const cloudAvailable = () => Boolean(VISION_API_KEY) && (!isWeb || webCloudAllowed);

export const getCloudAssist = () => cloudAssist && cloudAvailable();

export function setCloudAssist(on) {
  cloudAssist = Boolean(on);
  listeners.forEach(fn => fn());
}

/** 給 React 的 useSyncExternalStore 使用 */
export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 連線測驗版面：'random' = 每次不同（難度相近），'standard' = 固定的標準版面
let trailLayoutMode = 'random';
export const getTrailLayoutMode = () => trailLayoutMode;
export function setTrailLayoutMode(mode) {
  trailLayoutMode = mode === 'standard' ? 'standard' : 'random';
  listeners.forEach(fn => fn());
}
