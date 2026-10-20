// hooks/useWindowSize.js
// 和 useWindowDimensions 一樣，但修正網頁版的問題：
// 網頁版是先在電腦上預先產生 HTML（那時不知道螢幕多大，寬度是 0），瀏覽器再接手。
// 接手的第一次畫面必須和預先產生的一樣，之後才換成真正的螢幕大小，否則尺寸會一直停在 0。
import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export function useWindowSize() {
  const dims = useWindowDimensions();
  const [ready, setReady] = useState(Platform.OS !== 'web');
  useEffect(() => setReady(true), []);
  return ready ? dims : { ...dims, width: 0, height: 0 };
}
