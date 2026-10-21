// utils/drawingStore.js
// 保存每次畫鐘的圖，給人工評分時看。每張圖分開存一筆（不和紀錄放在一起），
// 因為 Android 的 AsyncStorage 單筆資料太大會存不進去。
//   手繪：{ kind: 'canvas', width, height, strokes: [[[x, y], ...], ...] }（每筆最多 80 個點、座標取整數）
//   拍照：{ kind: 'photo', jpeg: base64 }（縮小過的照片）

const PREFIX = 'tagusb.drawing.';
const MAX_POINTS = 80;

/** 手繪筆畫 → 精簡後的保存格式 */
export function compactStrokes(strokes, width, height) {
  return {
    kind: 'canvas',
    width: Math.round(width),
    height: Math.round(height),
    strokes: strokes.map(s => {
      const pts = s.points;
      const step = Math.max(1, pts.length / MAX_POINTS);
      const out = [];
      for (let i = 0; i < pts.length; i += step) out.push([Math.round(pts[Math.floor(i)].x), Math.round(pts[Math.floor(i)].y)]);
      const last = pts[pts.length - 1];
      if (pts.length > 1) out.push([Math.round(last.x), Math.round(last.y)]);
      return out;
    }),
  };
}

/** @param storage { getItem, setItem, removeItem } */
export function createDrawingStore(storage) {
  return {
    async save(id, drawing) {
      try { await storage.setItem(PREFIX + id, JSON.stringify(drawing)); return true; } catch (e) { console.warn('保存畫鐘圖失敗', e); return false; }
    },
    async load(id) {
      try { const raw = await storage.getItem(PREFIX + id); return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    remove(ids) {
      for (const id of ids) Promise.resolve(storage.removeItem(PREFIX + id)).catch(() => {});
    },
  };
}
