// utils/samples.js
// App 用的辨識樣本收集（存在手機的 AsyncStorage）。邏輯在 utils/sampleCollect.js。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { collectFromClock, createSampleStore } from './sampleCollect';

export const sampleStore = createSampleStore(AsyncStorage);

let loading = null;
export function loadSamples() {
  loading ??= sampleStore.load();
  return loading;
}

export function useSamples() {
  return useSyncExternalStore(sampleStore.subscribe, sampleStore.getState, sampleStore.getState);
}

/**
 * 測驗完成後呼叫：有開啟收集才會收。回傳收了幾個（沒開啟 = 0）
 * @param {'canvas'|'photo'} kind
 */
export function collectSamples({ clusters, recs, scored, kind }) {
  const { enabled, contributor } = sampleStore.getState();
  if (!enabled) return 0;
  return sampleStore.add(collectFromClock({ clusters, recs, scored, kind, contributor }));
}
