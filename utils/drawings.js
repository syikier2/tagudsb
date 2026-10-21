// utils/drawings.js
// App 用的畫鐘圖保存（AsyncStorage）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDrawingStore } from './drawingStore';

export const drawingStore = createDrawingStore(AsyncStorage);
