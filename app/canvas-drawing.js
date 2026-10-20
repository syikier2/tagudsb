// app/canvas-drawing.js
// 手機手繪模式：在畫布的圓圈裡寫上 1~12，再畫出指針（預設 11 點 10 分，參考 MoCA 畫鐘題）。
// 1. 用筆畫座標把數字分組、找出指針（utils/strokeClusters.js）
// 2. 在手機上直接用 $P 點雲辨識法認出每個數字（utils/digitRecognizer.js）；
//    若首頁開啟「雲端輔助辨識」，沒把握的字再送 Google Cloud Vision 給第二意見（utils/cloudAssist.js）
// 3. 數字位置評分（utils/clockScoring.js）、指針評分（utils/handsScoring.js）
// 4. 作畫過程指標，只供觀察不計分（utils/drawingStats.js）
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWindowSize } from '../hooks/useWindowSize';
import DrawingCanvas from '../components/DrawingCanvas';
import { ClockResult, DebugPanel, DrawingProcess, ErrorBox, HandsResult, readingText } from '../components/ClockResult';
import { CollectedNotice, SavedNotice, TesterBar } from '../components/TesterBar';
import { Button } from '../components/ui';
import { accents, colors, radius, space, type } from '../constants/theme';
import { profileStore } from '../utils/profiles';
import { collectSamples } from '../utils/samples';
import { clockSummary } from '../utils/resultSummary';
import { cloudSummaryText, refineWithCloud } from '../utils/cloudAssist';
import { scoreTokens } from '../utils/clockScoring';
import { recognizeCluster } from '../utils/digitRecognizer';
import { computeDrawingStats } from '../utils/drawingStats';
import { scoreHands, TARGET_TIME, targetsFromNumbers } from '../utils/handsScoring';
import { getCloudAssist } from '../utils/settings';
import { clusterStrokes, parseStrokes, renderSheet } from '../utils/strokeClusters';
import { annotateImages } from '../utils/visionApi';
import { notify } from '../utils/dialog';

const TIME_TEXT = `${TARGET_TIME.hour} 點 ${TARGET_TIME.minute} 分`;
const NUMBER_QUADRANT_TOLERANCE = 45; // MoCA「數字位置大致正確」：誤差在半個象限內

const newSession = () => ({ startedAt: null, clears: 0, undos: 0, recordId: null, collected: false });

export default function CanvasDrawingScreen() {
  const { width, height } = useWindowSize();
  // 畫布固定為正方形，圓圈才會是正圓
  const canvasSize = Math.max(0, Math.min(width - 40, height * 0.5));

  const canvasRef = useRef(null);
  const canvasLayout = useRef({ width: 0, height: 0 }); // 畫布實際大小（與筆畫座標同單位）
  const waitingForData = useRef(false);
  const session = useRef(newSession()); // 這次測驗的開始時間、清除與復原次數
  const strokesOnCanvas = useRef(0); // 畫布上目前有幾筆，用來判斷復原／清除是否真的有作用

  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('分析中…');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState(null);
  const [saved, setSaved] = useState(undefined); // undefined = 還沒有結果；null = 沒有受測者，沒存
  const [collected, setCollected] = useState(0);   // 這次收集了幾個辨識樣本

  const resetResult = () => {
    setResult(null);
    setError('');
    setDebug(null);
    setSaved(undefined);
    setCollected(0);
  };

  const handleBegin = () => {
    setScrollEnabled(false); // 畫的時候鎖住捲動，避免直線筆畫變成捲動頁面
    if (session.current.startedAt === null) session.current.startedAt = Date.now();
  };

  const handleEnd = () => {
    setScrollEnabled(true);
    strokesOnCanvas.current += 1;
  };

  const handleClear = () => {
    if (result) {
      session.current = newSession(); // 看完結果後清除 = 開始新的一次測驗
    } else if (strokesOnCanvas.current > 0) {
      session.current.clears += 1; // 測驗中途清除重畫（畫布空的時候按不算）
    }
    strokesOnCanvas.current = 0;
    canvasRef.current?.clearSignature();
    resetResult();
  };

  const handleUndo = () => {
    if (loading || strokesOnCanvas.current === 0) return; // 沒有筆畫可以復原，不計次
    strokesOnCanvas.current -= 1;
    session.current.undos += 1;
    canvasRef.current?.undo();
  };

  const handleSubmit = () => {
    if (loading) return;
    waitingForData.current = true;
    canvasRef.current?.getData(); // 回傳筆畫座標 → handleStrokeData
  };

  const handleStrokeData = async (json) => {
    if (!waitingForData.current) return;
    waitingForData.current = false;

    const strokes = parseStrokes(json);
    if (strokes.length === 0) {
      notify('畫布是空的', `請先在圓圈裡寫上 1 到 12，再畫出指向 ${TIME_TEXT} 的指針。`);
      return;
    }

    resetResult();
    setLoadingText('分析中…');
    setLoading(true);
    try {
      const size = canvasLayout.current.width > 0 ? canvasLayout.current : { width: canvasSize - 4, height: canvasSize - 4 };

      // 1. 分組：排除圓圈，找出指針，靠在一起的筆畫算同一個數字
      const { clusters, handStrokes, ignored } = clusterStrokes(strokes, size);
      if (clusters.length === 0) {
        setError('沒有找到數字的筆畫。請在圓圈內側寫上 1～12，不需要另外畫圓圈。');
        return;
      }

      // 讓「分析中」的轉圈圈先顯示出來，再開始計算
      await new Promise(r => setTimeout(r, 30));

      // 2. 在手機上辨識每一組的數字
      let recs = clusters.map(c => recognizeCluster(c));

      // 2b. 雲端輔助（使用者在首頁開啟時）：只把手機端沒把握的字送 Google Cloud Vision 確認
      let cloud = null;
      if (getCloudAssist()) {
        setLoadingText('雲端輔助辨識中…');
        const refined = await refineWithCloud(recs, { ask: imgs => annotateImages(imgs) });
        recs = refined.recs;
        cloud = refined.summary;
      }

      const readings = [];
      const tokens = [];
      let unsure = 0;
      clusters.forEach((c, i) => {
        const rec = recs[i];
        unsure += rec.chars.filter(ch => !ch.confident && ch.cloud?.outcome !== 'agree' && ch.cloud?.outcome !== 'changed').length;
        readings.push({ id: c.id, text: readingText(c.id, rec) });
        const h = Math.max(1, c.box.y1 - c.box.y0);
        tokens.push({ digits: rec.digits, box: { ...c.box, h } });
      });

      // 3. 數字：位置用原本的筆畫座標評分
      const scored = scoreTokens(tokens, { centerX: size.width / 2, centerY: size.height / 2 });
      if (unsure > 0) scored.details.push(`有 ${unsure} 個字的筆跡不太確定，建議寫得更清楚一點`);
      if (cloud) scored.details.push(cloudSummaryText(cloud));
      const numbersPass = scored.numbers.every(
        n => n.status !== 'missing' && n.angleError <= NUMBER_QUADRANT_TOLERANCE
      );

      // 4. 指針
      const hands = scoreHands(handStrokes, size, undefined, targetsFromNumbers(scored.numbers)); // 以受測者寫的數字位置為準

      // 5. 作畫過程（不計分）
      const stats = computeDrawingStats(strokes, session.current);

      // 字卡圖只用來在偵錯資訊裡顯示分組結果
      const sheet = renderSheet(clusters);
      setResult({ numbers: scored, numbersPass, hands, stats });
      // 存到目前受測者的歷史紀錄（沒有選擇受測者就不存）
      // 同一張圖重複按「送出分析」只保留最後一次，不會存成好幾筆
      if (session.current.recordId) profileStore.deleteResult(session.current.recordId);
      const record = profileStore.addResult(clockSummary('canvas', { numbers: scored, numbersPass, hands, stats, cloud }));
      session.current.recordId = record?.id ?? null;
      setSaved(record);
      // 辨識樣本收集（開發用，有開啟才收；不影響評分）
      // 同一張圖重複送出只收一次
      if (!session.current.collected) {
        const n = collectSamples({ clusters, recs, scored, kind: 'canvas' });
        session.current.collected = n > 0;
        setCollected(n);
      }
      setDebug({ sheetBase64: sheet.base64, sheetWidth: sheet.width, sheetHeight: sheet.height, readings, ignored });
    } catch (e) {
      console.error(e);
      setError('分析時發生未預期的錯誤，請再試一次。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '手繪畫鐘測驗' }} />
      <ScrollView contentContainerStyle={styles.scrollContent} scrollEnabled={scrollEnabled}>
        <TesterBar />
        <View style={styles.header}>
          <Text style={styles.subtitle}>請在圓圈裡寫上 1～12</Text>
          <Text style={styles.subtitle}>再從中心畫兩根指針，指向 {TIME_TEXT}</Text>
          <Text style={styles.instruction}>數字沿著圓圈內側寫大一點；時針要比分針短，畫直線就好，不用畫箭頭</Text>
        </View>

        <View
          style={[styles.canvasContainer, { width: canvasSize, height: canvasSize }]}
          onLayout={e => {
            // 扣掉邊框，就是畫布的實際大小
            const { width: w, height: h } = e.nativeEvent.layout;
            canvasLayout.current = { width: w - 4, height: h - 4 };
          }}
        >
          {/* 手機用 WebView 畫布、網頁用瀏覽器畫布（components/DrawingCanvas.js / .web.js） */}
          <DrawingCanvas ref={canvasRef} onGetData={handleStrokeData} onBegin={handleBegin} onEnd={handleEnd} />
        </View>

        <View style={[styles.buttonRow, { width: canvasSize }]}>
          <Button title="清除" icon="refresh" variant="secondary" onPress={handleClear} disabled={loading} style={styles.smallButton} compact />
          <Button title="復原" icon="arrow-undo" variant="secondary" onPress={handleUndo} disabled={loading} style={styles.smallButton} compact />
          <Button
            title={loading ? loadingText : '送出分析'}
            icon={loading ? undefined : 'checkmark'}
            color={accents.canvas}
            onPress={handleSubmit}
            disabled={loading}
            style={styles.submitButton}
            compact
          />
        </View>

        {loading && <ActivityIndicator size="large" color={accents.canvas} style={{ marginTop: 20 }} />}

        <ErrorBox message={error} />
        {!loading && result && (
          <>
            <SavedNotice saved={saved} />
            <CollectedNotice count={collected} />
            <ClockResult result={result.numbers} accent={accents.canvas} title="數字評估" />
            <HandsResult hands={result.hands} numbersPass={result.numbersPass} timeText={TIME_TEXT} />
            <DrawingProcess stats={result.stats} />
          </>
        )}
        {!loading && debug && (
          <DebugPanel
            sheet={{ base64: debug.sheetBase64, width: debug.sheetWidth, height: debug.sheetHeight }}
            readings={debug.readings}
            ignored={debug.ignored}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 12 },
  subtitle: { ...type.subtitle, fontSize: 19, textAlign: 'center' },
  instruction: { ...type.small, marginTop: 6, textAlign: 'center' },

  canvasContainer: {
    backgroundColor: 'white',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.line,
    marginBottom: 12,
  },

  buttonRow: { flexDirection: 'row', gap: space.sm },
  smallButton: { flex: 1 },
  submitButton: { flex: 1.6 },
});
