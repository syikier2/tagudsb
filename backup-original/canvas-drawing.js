// app/canvas-drawing.js
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';

// 你的專屬 API KEY
const GOOGLE_VISION_API_KEY = "AIzaSyB8rjtfeN41mwgTz2faJjxe8_jxROnkA84"; 
const { width, height } = Dimensions.get('window');

export default function CanvasDrawingScreen() {
  const [loading, setLoading] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [debugText, setDebugText] = useState(''); 
  // ✨【新增狀態】：儲存 Google Vision API 回傳的原始 JSON 數據流
  const [rawJsonData, setRawJsonData] = useState(null);
  const canvasRef = useRef();

  const scoreClockTest = (fullText) => {
    if (!fullText) {
      return { score: 1, comment: "未偵測到文字。請試著沿著淡淡的圓點標示寫下數字喔！" };
    }
    
    setDebugText(fullText);
    let clockNumbers = [];
    
    const matches = fullText.match(/[0-9OlIZSgq]+/g);
    if (matches) {
      matches.forEach(match => {
        let normalizedText = match.toUpperCase().replace(/O/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/[GQ]/g, '9');
        const parsedMatches = normalizedText.match(/\d+/g);
        if (parsedMatches) {
          parsedMatches.forEach(numText => {
            const num = parseInt(numText, 10);
            if (num >= 1 && num <= 12 && !clockNumbers.some(n => n.number === num)) {
              clockNumbers.push({ number: num }); 
            }
          });
        }
      });
    }

    if (clockNumbers.length < 4) {
      return { score: 1, comment: `辨識到的有效數字過少（僅 ${clockNumbers.length} 個）。請把 1 到 12 工整寫出喔！` };
    }

    let score = 5; 
    let logMessages = [];
    if (!clockNumbers.some(n => n.number === 12)) { score -= 1; logMessages.push("缺 12"); }
    if (!clockNumbers.some(n => n.number === 6)) { score -= 1; logMessages.push("缺 6"); }
    if (clockNumbers.length < 9) { score -= 1; logMessages.push("有遺漏"); }

    let comment = score >= 4 ? "太棒了！您的認知功能相當健康，空間規劃漂亮，請繼續保持！" : "數字排列有些許偏移或遺漏（如：" + logMessages.join('、') + "），建議持續追蹤觀察。";
    return { score, comment };
  };

  const handleSignature = async (signature) => {
    setLoading(true); setAssessment(null); setDebugText(''); setRawJsonData(null); // 送出前清空舊數據
    try {
      const base64Data = signature.split(",")[1];
      const requestBody = {
        requests: [{
          image: { content: base64Data },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 5 }]
        }]
      };
      
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const responseJson = await response.json();
      
      // ✨【關鍵實作】：將完整的雲端原始 JSON 響應掛載到狀態機中
      setRawJsonData(responseJson);
      
      const fullText = responseJson.responses?.[0]?.fullTextAnnotation?.text || "";
      
      setDebugText(fullText || "[API 沒有識別到任何文字，可能筆跡太細或被背景吃掉]");
      setAssessment(scoreClockTest(fullText));
      
    } catch (error) {
      setAssessment({ score: 0, comment: "分析發生錯誤，請檢查網路狀態。" });
    } finally {
      setLoading(false);
    }
  };

  // 移除網頁的框線與陰影，讓畫布乾淨
  const webStyle = `.m-signature-pad--footer {display: none;} .m-signature-pad {box-shadow: none; border: none; margin: 0;}`;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '手機手繪測驗' }} />
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>請沿著圓圈內的標示<Text style={{color: '#E74C3C'}}>大字</Text>寫上數字</Text>
        </View>

        <View style={styles.canvasContainer}>
          {/* ⭐ 1. 底層：數位畫布 (絕對不透明的白底黑字) */}
          <SignatureScreen
            ref={canvasRef}
            onOK={handleSignature}
            webStyle={webStyle}
            autoClear={false}
            strokeWidth={5} 
            minWidth={4}
            descriptionText=""
            backgroundColor="#ffffff" // 絕對白底
            penColor="#000000"        // 絕對黑字
            imageType="image/jpeg"    
            style={{ flex: 1 }} // 移除 transparent，恢復實體白色
          />

          {/* ⭐ 2. 頂層：UI 引導模板 (浮在上面，pointerEvents="none" 讓手可以穿透畫畫) */}
          <View style={styles.canvasTemplate} pointerEvents="none">
            <View style={styles.templateCircle} />
            <View style={[styles.guideDot, { top: 10, alignSelf: 'center' }]}><Text style={styles.guideNum}>12</Text></View>
            <View style={[styles.guideDot, { bottom: 10, alignSelf: 'center' }]}><Text style={styles.guideNum}>6</Text></View>
            <View style={[styles.guideDot, { right: 10, top: '50%', marginTop: -25 }]}><Text style={styles.guideNum}>3</Text></View>
            <View style={[styles.guideDot, { left: 10, top: '50%', marginTop: -25 }]}><Text style={styles.guideNum}>9</Text></View>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={() => { canvasRef.current.clearSignature(); setDebugText(''); setAssessment(null); setRawJsonData(null); }}>
            <Text style={styles.buttonText}>清除重畫</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={() => canvasRef.current.readSignature()}>
            <Text style={styles.buttonText}>送出分析</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator size="large" color="#4A90E2" style={{marginTop: 20}} />}

        {debugText ? (
          <View style={styles.debugContainer}>
            <Text style={styles.debugTitle}>🔍 照妖鏡（AI 看到的文字）：</Text>
            <Text style={styles.debugText}>{debugText}</Text>
          </View>
        ) : null}

        {assessment && !loading && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>📊 健康認知評估結果</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>綜合得分：</Text>
              <Text style={styles.scoreValue}>{assessment.score} / 5</Text>
            </View>
            <Text style={styles.resultText}>{assessment.comment}</Text>
          </View>
        )}

        {/* ✨───【核心新增】：JSON 數據原始資料照妖鏡控制台 ───✨ */}
        <Text style={styles.debugSectionTitle}>⚡ 偵錯控制台 (原始 JSON 數據架構)</Text>
        <View style={styles.jsonDebugWindow}>
          {rawJsonData ? (
            <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 300 }}>
              <Text style={styles.codeText}>
                {JSON.stringify(rawJsonData, null, 2)}
              </Text>
            </ScrollView>
          ) : (
            <Text style={styles.placeholderCodeText}>
              暫無原始數據。請在數位畫布上書寫鐘面數字並點擊「送出分析」，系統將會實時於雲端提取完整的文本特徵、邊框頂點（BoundingBox）相對座標結構並格式化輸出於此。
            </Text>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB', paddingTop: 20 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 10 },
  subtitle: { fontSize: 18, color: '#546E7A', fontWeight: 'bold' },
  canvasContainer: { 
    height: height * 0.45, // 微調高度保留下方控制台空間
    width: '100%', 
    backgroundColor: 'white', 
    borderRadius: 16, 
    overflow: 'hidden', 
    borderWidth: 2, 
    borderColor: '#BDC3C7', 
    marginBottom: 10, 
    position: 'relative'
  },
  
  canvasTemplate: { 
    position: 'absolute', 
    top: 0, left: 0, right: 0, bottom: 0, 
    justifyContent: 'center', alignItems: 'center', padding: 20,
    zIndex: 10
  },
  templateCircle: { width: '100%', height: '100%', borderRadius: 1000, borderWidth: 3, borderColor: '#E1E8EE', opacity: 0.5 },
  guideDot: { position: 'absolute', backgroundColor: '#E1E8EE', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  guideNum: { fontSize: 20, fontWeight: 'bold', color: '#BDC3C7' },
  
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 10 },
  button: { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, elevation: 3 },
  clearButton: { backgroundColor: '#95A5A6' },
  submitButton: { backgroundColor: '#4A90E2' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  debugContainer: { width: '100%', backgroundColor: '#FFF9E6', padding: 12, borderRadius: 8, marginTop: 10 },
  debugTitle: { fontSize: 14, fontWeight: 'bold', color: '#F57C00' },
  debugText: { fontSize: 14, color: '#5D4037', fontFamily: 'monospace' },
  resultContainer: { width: '100%', backgroundColor: 'white', padding: 20, borderRadius: 16, marginTop: 15, elevation: 2, marginBottom: 15 },
  resultTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 10 },
  scoreRow: { backgroundColor: '#EDF5FF', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  scoreLabel: { fontSize: 16, color: '#333', fontWeight: '600' },
  scoreValue: { fontSize: 28, color: '#007AFF', fontWeight: '900' },
  resultText: { fontSize: 16, color: '#34495E', lineHeight: 24 },

  // ✨【新增樣式】：專業科技感的 JSON 除錯黑窗
  debugSectionTitle: { alignSelf: 'flex-start', fontSize: 15, fontWeight: 'bold', color: '#7F8C8D', marginTop: 15, marginBottom: 5, paddingLeft: 5 },
  jsonDebugWindow: { width: '100%', backgroundColor: '#1C1C1E', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#2C2C2E', minHeight: 140 },
  codeText: { fontFamily: 'monospace', fontSize: 11, color: '#30D158' }, // 終端機駭客綠
  placeholderCodeText: { fontFamily: 'monospace', fontSize: 12, color: '#8E8E93', fontStyle: 'italic', lineHeight: 18 }
});