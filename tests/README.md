# 自動測試

修改辨識或評分程式之後，在專案資料夾執行：

```
npm test
```

全部顯示 `ok`、最後 `# fail 0`，就代表沒有把東西改壞。需要 Node.js 20.19 以上（Expo SDK 57 本來就要求這個版本）。

開頭可能會出現 `MODULE_TYPELESS_PACKAGE_JSON` 警告，意思是 Node 自動判斷出這些檔案使用 `import` 語法，不影響測試結果，可以忽略。

## 測了什麼

| 檔案 | 內容 |
|---|---|
| `recognizer.test.mjs` | 數字辨識：**50 個真實手寫數字**、標準寫法 0～9、兩位數切字、圈圈判斷、小點過濾 |
| `clock.test.mjs` | 完整流程：數字位置評分、缺數字、位置對調、自畫圓圈排除、指針評分（7 種畫法）、作畫過程計算 |
| `photo.test.mjs` | 拍照模式：真實紙本照片、加上指針、陰影，以及照片骨架的指針判斷 |
| `cloud.test.mjs` | 混合式辨識：只有沒把握的字送雲端、融合規則（雲端只能在手機端前兩名之間選）、雲端失敗時退回手機端、分批呼叫 Google（用假的回應，不會真的連線） |
| `profiles.test.mjs` | 受測者與歷史紀錄：資料檢查、新增後自動選取、紀錄只存給目前受測者、刪除受測者連同紀錄、重新開啟 App 資料還在、資料壞掉不當機 |
| `trail.test.mjs` | 連線測驗：版面規則（不重疊、路線不穿過其他圓圈）、連線判斷、錯誤與放開次數、B/A 比值 |

`fixtures/handwriting.json` 是從 App 截圖擷取的真實筆跡（骨架像素座標）與正確答案，來自三次實際測試。

拍照模式的測試資料（`fixtures/`）：
- `photo-clock-1.jpg`、`photo-clock-2.jpg`、`photo-clock-3.jpg`：實際拍攝的紙本畫鐘（2、3 有畫指針）
- `photo-clock-1-shadow.jpg`、`photo-clock-1-with-hands.jpg`：用程式在照片 1 上加陰影、加上「3 點整」指針的模擬版本
- `photo-digits.json`：從三張照片擷取的 45 個數字

目前 3 張真實照片都能拿到滿分，但都是同一個人寫的。**請再加幾張不同的人、不同的筆、不同光線拍的照片**，測試才有代表性。

## 遇到新的認錯怎麼辦

1. 在 App 展開「偵錯資訊」截圖，找出被認錯的字。
2. 在 `utils/digitRecognizer.js` 的 `TEMPLATE_STROKES` 加一個符合那種寫法的範本。
3. 執行 `npm test`，確認新範本沒有讓原本認對的字變錯。
   （加範本最常見的問題就是「修好一個、弄壞另一個」，例如帶勾的 7 和小圈的 9。）
4. 最好把新的筆跡也加進 `fixtures/handwriting.json`，以後就會一直被測到。

## 手機端 vs 雲端 vs 混合式 比較實驗

這個會**真的呼叫 Google Cloud Vision**（需要 `.env.local` 的金鑰，內建資料約 105 張小圖，在每月免費額度內）：

```
node scripts/compare-cloud.mjs
```

結果存在 `results/cloud-compare-日期.md`，表格可以直接貼進報告。加上 `--save-images` 會把送給雲端的小圖存到 `results/glyphs/`。

內建的兩組資料曾用來調整手機端的範本，所以手機端在這兩組的成績會偏高。要公平比較，請收集其他人的筆跡做成新的 json（格式同 `fixtures/handwriting.json`），再執行 `node scripts/compare-cloud.mjs 新資料.json`。
