// utils/visionApi.js
// 呼叫 Google Cloud Vision（雲端影像辨識）。
// 本專題的用法：手機端辨識沒把握的字，才把「那一個字」畫成小圖送上來，請雲端給第二意見
// （融合規則見 utils/cloudAssist.js）。整張圖、受測者資料都不會上傳。
//
// API 金鑰放在專案根目錄的 .env.local（已被 .gitignore 忽略，不會被推上 GitHub）：
//   EXPO_PUBLIC_GOOGLE_VISION_API_KEY=你的金鑰
// 修改 .env.local 之後要重新執行 `npx expo start -c`。

export const VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const BATCH_SIZE = 16;     // Google 規定一次最多 16 張圖
const TIMEOUT_MS = 15000;

export class VisionError extends Error {}

/**
 * 一次辨識多張小圖
 * @param {string[]} images base64（不含 "data:image/...;base64," 前綴）
 * @param {{ apiKey?: string, fetchImpl?: Function, timeoutMs?: number }} options
 * @returns {Promise<string[]>} 每張圖讀到的文字（沒讀到 = 空字串），順序與 images 相同
 */
export async function annotateImages(images, { apiKey = VISION_API_KEY, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (!apiKey) throw new VisionError('尚未設定 API 金鑰（.env.local 的 EXPO_PUBLIC_GOOGLE_VISION_API_KEY）。');
  const texts = [];
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    texts.push(...(await annotateBatch(images.slice(i, i + BATCH_SIZE), apiKey, fetchImpl, timeoutMs)));
  }
  return texts;
}

async function annotateBatch(images, apiKey, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: images.map(content => ({
          image: { content },
          // Google 建議手寫辨識使用 DOCUMENT_TEXT_DETECTION
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          // 指定英文/數字，避免把「1」讀成中文的「一」
          imageContext: { languageHints: ['en'] },
        })),
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new VisionError(e.name === 'AbortError' ? '連線逾時' : '無法連線到 Google（可能沒有網路）');
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new VisionError(`Google 回應異常（HTTP ${response.status}）`);
  }
  // 金鑰錯誤、帳單未啟用、額度用完等情況
  if (!response.ok || json.error) {
    throw new VisionError(`Google 回傳錯誤：${json.error?.message || `HTTP ${response.status}`}`);
  }
  // 單張圖失敗只當作「沒讀到」，不影響其他張
  return images.map((_, k) => {
    const r = json.responses?.[k];
    if (!r || r.error) return '';
    return r.fullTextAnnotation?.text || r.textAnnotations?.[0]?.description || '';
  });
}
