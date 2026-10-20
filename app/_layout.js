// app/_layout.js
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors } from '../constants/theme';
import { loadProfiles } from '../utils/profiles';
import { loadSamples } from '../utils/samples';

export default function Layout() {
  useEffect(() => {
    loadProfiles(); // 讀取手機裡的受測者資料與歷史紀錄
    loadSamples();  // 辨識樣本收集（開發用）
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '800', fontSize: 20, color: colors.ink },
          headerBackTitle: '返回', // iOS 返回按鈕文字
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </>
  );
}
