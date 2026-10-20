// components/DrawingCanvas.js
// 手機版（iOS / Android）手繪畫布：使用 react-native-signature-canvas（內部是 WebView）。
// 網頁版在 DrawingCanvas.web.js，兩者用法相同：
//   ref.getData() → onGetData(筆畫 JSON)、ref.clearSignature()、ref.undo()
import SignatureScreen from 'react-native-signature-canvas';

// 讓畫布填滿整個 WebView、移除預設框線與按鈕列。
// 引導圓圈直接用 CSS 畫在畫布上方：一定會顯示，而且不會被存進筆畫資料或圖片。
const WEB_STYLE = `
  html, body { margin: 0; padding: 0; height: 100%; background: #ffffff; }
  .m-signature-pad { position: absolute; top: 0; left: 0; right: 0; bottom: 0; margin: 0; box-shadow: none; border: none; }
  .m-signature-pad--body { position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: none; }
  .m-signature-pad--body::after {
    content: ''; position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
    border: 3px solid #D6DEE6; border-radius: 50%; pointer-events: none;
  }
  .m-signature-pad--body::before {
    content: ''; position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px;
    background: #D6DEE6; border-radius: 50%; pointer-events: none; z-index: 1;
  }
  .m-signature-pad--footer { display: none; }
`;

export default function DrawingCanvas({ ref, onGetData, onBegin, onEnd }) {
  return (
    <SignatureScreen
      ref={ref}
      onGetData={onGetData}
      onBegin={onBegin}
      onEnd={onEnd}
      webStyle={WEB_STYLE}
      autoClear={false}
      minWidth={3}
      maxWidth={6}
      descriptionText=""
      backgroundColor="#ffffff"
      penColor="#000000"
      style={{ flex: 1 }}
    />
  );
}
