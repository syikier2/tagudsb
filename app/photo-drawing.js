// app/photo-drawing.js
// 紙本拍照模式：拍下（或從相簿選擇）紙上畫好的時鐘，在手機上分析；
// 首頁開啟「雲端輔助辨識」時，沒把握的字會再送 Google Cloud Vision 確認。
// 影像處理見 utils/photoAnalysis.js，完整流程見 utils/photoClock.js；
// 分組、辨識、評分與手繪模式共用同一套模組。
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWindowSize } from '../hooks/useWindowSize';
import { ClockResult, DebugPanel, ErrorBox, HandsResult, readingText } from '../components/ClockResult';
import { CollectedNotice, SavedNotice, TesterBar } from '../components/TesterBar';
import { Button } from '../components/ui';
import { accents, colors, radius, space, type } from '../constants/theme';
import { profileStore } from '../utils/profiles';
import { collectSamples } from '../utils/samples';
import { clockSummary } from '../utils/resultSummary';
import { TARGET_TIME } from '../utils/handsScoring';
import { analyzePhotoClock } from '../utils/photoClock';
import { getCloudAssist } from '../utils/settings';
import { annotateImages } from '../utils/visionApi';
import { notify } from '../utils/dialog';

const TIME_TEXT = `${TARGET_TIME.hour} 點 ${TARGET_TIME.minute} 分`;
const ANALYSIS_WIDTH = 1000; // 分析前把照片縮放到這個寬度

const PICKER_OPTIONS = {
  mediaTypes: ['images'],
  allowsEditing: true, // 讓使用者裁切到只剩時鐘
  aspect: [1, 1],
  quality: 1,
};

export default function PhotoDrawingScreen() {
  const { width } = useWindowSize();
  const previewSize = Math.max(0, width - 40);

  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('分析中…');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [savedRecord, setSavedRecord] = useState(undefined); // undefined = 還沒有結果；null = 沒有受測者，沒存
  const [collected, setCollected] = useState(0);

  const pickImage = async (source) => {
    if (loading) return;
    let picked;
    try {
      if (source === 'camera') {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) {
          notify('需要相機權限', '請到手機設定中允許本 App 使用相機，才能拍照分析。');
          return;
        }
        picked = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
      } else {
        picked = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      }
    } catch {
      notify('無法開啟', source === 'camera' ? '無法開啟相機（模擬器可能沒有相機）。' : '無法開啟相簿。');
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    analyze(picked.assets[0].uri);
  };

  const analyze = async (uri) => {
    setImageUri(uri);
    setResult(null);
    setError('');
    setSavedRecord(undefined);
    setCollected(0);
    setLoadingText('分析中…');
    setLoading(true);
    try {
      // 統一縮放到固定寬度：太小的照片放大、太大的縮小，讓各種手機拍的照片都用同一套參數
      const rendered = await ImageManipulator.manipulate(uri).resize({ width: ANALYSIS_WIDTH }).renderAsync();
      const saved = await rendered.saveAsync({ compress: 0.9, format: SaveFormat.JPEG, base64: true });

      // 讓「分析中」的轉圈圈先顯示出來，再開始計算（約需 1～3 秒）
      await new Promise(r => setTimeout(r, 50));
      const useCloud = getCloudAssist();
      if (useCloud) setLoadingText('分析中…（沒把握的字會送雲端確認）');
      const r = await analyzePhotoClock(saved.base64, useCloud ? { ask: imgs => annotateImages(imgs) } : {});

      if (r.numbers.foundCount === 0 && !r.contour.found) {
        setError('照片裡找不到時鐘。請讓整個時鐘在畫面中、光線均勻，用深色的筆畫會更清楚。');
        return;
      }
      setResult(r);
      setSavedRecord(profileStore.addResult(clockSummary('photo', r))); // 存到目前受測者的歷史紀錄
      setCollected(collectSamples({
        clusters: r.debug.clusters, recs: r.debug.readings.map(x => x.rec), scored: r.numbers, kind: 'photo',
      }));
    } catch (e) {
      console.error(e);
      setError('處理照片時發生錯誤，請再試一次。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '紙本拍照測驗' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TesterBar />
        <View style={styles.header}>
          <Text style={styles.subtitle}>請拍下紙上畫好的時鐘</Text>
          <Text style={styles.instruction}>
            在白紙上畫一個圓，寫上 1～12，再畫兩根指針指向 {TIME_TEXT}。
          </Text>
          <Text style={styles.instruction}>拍照時讓整個時鐘在畫面中、光線均勻；用深色的筆會更清楚。</Text>
        </View>

        <View style={[styles.preview, { width: previewSize, height: previewSize }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="image-outline" size={72} color={colors.line} />
              <Text style={styles.placeholderText}>照片會顯示在這裡</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          <Button title="拍照" icon="camera" color={accents.photo} onPress={() => pickImage('camera')} disabled={loading} style={{ flex: 1 }} />
          <Button title="從相簿選擇" icon="images-outline" variant="secondary" color={accents.photo} onPress={() => pickImage('library')} disabled={loading} style={{ flex: 1 }} />
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={accents.photo} />
            <Text style={styles.loadingText}>{loadingText}</Text>
          </View>
        )}

        <ErrorBox message={error} />
        {!loading && result && (
          <>
            <SavedNotice saved={savedRecord} />
            <CollectedNotice count={collected} />
            <ClockResult result={result.numbers} accent={accents.photo} title="數字評估" />
            <HandsResult
              hands={result.hands}
              numbersPass={result.numbersPass}
              timeText={TIME_TEXT}
              contour={result.contour}
            />
            <DebugPanel
              preview={result.debug.binaryPreview}
              sheet={result.debug.sheet}
              readings={result.debug.readings.map(r => ({ id: r.id, text: readingText(r.id, r.rec) }))}
              ignored={result.debug.ignored}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 16 },
  subtitle: { ...type.title, textAlign: 'center' },
  instruction: { ...type.small, marginTop: 6, textAlign: 'center' },

  preview: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.line,
    borderStyle: 'dashed',
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center' },
  placeholderText: { fontSize: 17, color: colors.inkFaint, fontWeight: '700', marginTop: 8 },

  buttonRow: { flexDirection: 'row', gap: space.sm, width: '100%' },
  loadingBox: { alignItems: 'center', marginTop: 20 },
  loadingText: { marginTop: 8, fontSize: 16, color: colors.inkSoft },
});
