// utils/profiles.js
// App 用的受測者資料（存在手機的 AsyncStorage）。畫面用 useProfiles() 取得資料，資料改變時自動更新。

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createProfileStore } from './profileStore';

export const profileStore = createProfileStore(AsyncStorage);

let loading = null;
/** App 啟動時呼叫一次（app/_layout.js） */
export function loadProfiles() {
  loading ??= profileStore.load();
  return loading;
}

/** @returns {{ profiles, activeId, results, loaded }} */
export function useProfiles() {
  return useSyncExternalStore(profileStore.subscribe, profileStore.getState, profileStore.getState);
}

export function useActiveProfile() {
  const state = useProfiles();
  return state.profiles.find(p => p.id === state.activeId) || null;
}
