// app/index.js
import { router, Stack } from 'expo-router';
import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');

export default function MainMenu() {
  return (
    <View style={styles.container}>
      {/* 配置此頁面的標題 */}
      <Stack.Screen options={{ title: '大腦健康檢測' }} />

      <View style={styles.header}>
        <Text style={styles.title}>歡迎使用</Text>
        <Text style={styles.subtitle}>請選擇一種方式開始測驗</Text>
      </View>

      <View style={styles.buttonContainer}>
        {/* 按鈕一：實體拍照模式 */}
        <TouchableOpacity 
          style={[styles.menuButton, styles.photoButton]} 
          onPress={() => router.push('/photo-drawing')}
        >
          <Text style={styles.icon}>📸</Text>
          <Text style={styles.buttonText}>拍攝紙上畫鐘</Text>
          <Text style={styles.buttonDesc}>拍下在紙上畫好的時鐘</Text>
        </TouchableOpacity>

        {/* 按鈕二：數位手繪模式 */}
        <TouchableOpacity 
          style={[styles.menuButton, styles.canvasButton]} 
          onPress={() => router.push('/canvas-drawing')}
        >
          <Text style={styles.icon}>✍️</Text>
          <Text style={styles.buttonText}>在手機上畫鐘</Text>
          <Text style={styles.buttonDesc}>直接用手指在螢幕上畫</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB', padding: 20, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 36, fontWeight: '900', color: '#2C3E50' },
  subtitle: { fontSize: 20, color: '#546E7A', marginTop: 10 },
  buttonContainer: { gap: 20 },
  menuButton: {
    width: '100%',
    paddingVertical: 30,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5, // Android 陰影
    shadowColor: '#000', // iOS 陰影
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  photoButton: { backgroundColor: '#FF9F43' },
  canvasButton: { backgroundColor: '#4A90E2' },
  icon: { fontSize: 60, marginBottom: 10 },
  buttonText: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  buttonDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 16, marginTop: 5 }
});