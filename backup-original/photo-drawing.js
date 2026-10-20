// app/photo-drawing.js
import { useState } from 'react';
// ⭐ [已修正]：解構中加入了 Dimensions
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { ActivityIndicator, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOOGLE_VISION_API_KEY = "AIzaSyB8rjtfeN41mwgTz2faJjxe8_jxROnkA84"; 
// ⭐ [已修正]：定義了螢幕寬度 width
const { width } = Dimensions.get('window');

export default function PhotoDrawingScreen() {
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [debugText, setDebugText] = useState('');

  const scoreClockTest = (fullText) => {
    if (!fullText) return { score: 1, comment: "哎呀，照片裡好像沒有看到清楚的數字時鐘耶。" };
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
            if (num >= 1 && num <= 12 && !clockNumbers.some(n => n.number === num)) clockNumbers.push({ number: num });
          });
        }
      });
    }
    if (clockNumbers.length < 4) return { score: 1, comment: `照片裡的數字太少（僅 ${clockNumbers.length} 個），請確保紙上畫的 1 到 12 都清晰可見喔。` };
    let score = 5; 
    if (!clockNumbers.some(n => n.number === 12)) score -= 1;
    if (!clockNumbers.some(n => n.number === 6)) score -= 1;
    if (clockNumbers.length < 9) score -= 1;
    let comment = score >= 4 ? "太棒了！紙上畫的時鐘很完整，認知功能相當健康！" : "畫中的數字排列有些遺漏，建議多做腦力激盪並持續觀察。";
    return { score, comment };
  };

  const takePhotoAndAnalyze = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('抱歉，我們需要相機權限才能幫您拍照辨識喔！');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, 
      aspect: [1, 1], 
      quality: 1,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setImageUri(uri); 
    setLoading(true);
    setAssessment(null);
    setDebugText('');

    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }], 
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true } 
      );

      const base64Data = manipResult.base64;

      const requestBody = {
        requests: [{
          image: { content: base64Data },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 10 }] 
        }]
      };

      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseJson = await response.json();
      const fullText = responseJson.responses?.[0]?.fullTextAnnotation?.text || "";
      
      setAssessment(scoreClockTest(fullText));

    } catch (error) {
      console.error(error);
      setAssessment({ score: 0, comment: "分析過程發生錯誤，請檢查網路狀態並重試。" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '紙本拍照測驗' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <Text style={styles.subtitle}>請拍下紙上畫好的時鐘</Text>
          <Text style={styles.instruction}>確保 1~12 數字清晰、光線充足喔！</Text>
        </View>

        <View style={styles.imagePreviewContainer}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>📄</Text>
              <Text style={styles.placeholderText}>照片會顯示在這裡</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.cameraButton} onPress={takePhotoAndAnalyze}>
          <Text style={styles.buttonText}>📸 開啟相機拍照</Text>
        </TouchableOpacity>

        {loading && <ActivityIndicator size="large" color="#FF9F43" style={{marginTop: 20}} />}

        {debugText ? (
          <View style={styles.debugContainer}>
            <Text style={styles.debugTitle}>🔍 照妖鏡（照片裡看到的文字）：</Text>
            <Text style={styles.debugText}>{debugText}</Text>
          </View>
        ) : null}

        {assessment && !loading && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>📊 健康認知評估結果</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{assessment.score} / 5</Text>
            </View>
            <Text style={styles.resultText}>{assessment.comment}</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB', paddingTop: 20 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 20 },
  subtitle: { fontSize: 22, color: '#546E7A', fontWeight: 'bold' },
  instruction: { fontSize: 16, color: '#666', marginTop: 5, textAlign: 'center' },
  
  imagePreviewContainer: { 
    width: '100%', 
    height: width - 40, 
    backgroundColor: 'white', 
    borderRadius: 20, 
    overflow: 'hidden', 
    borderWidth: 2, 
    borderColor: '#BDC3C7', 
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center' },
  placeholderIcon: { fontSize: 80, marginBottom: 10 },
  placeholderText: { fontSize: 18, color: '#BDC3C7', fontWeight: 'bold' },

  cameraButton: { backgroundColor: '#FF9F43', width: '100%', paddingVertical: 20, borderRadius: 16, alignItems: 'center', elevation: 3 },
  buttonText: { color: 'white', fontSize: 24, fontWeight: 'bold' },

  debugContainer: { width: '100%', backgroundColor: '#FFF9E6', padding: 12, borderRadius: 8, marginTop: 20 },
  debugTitle: { fontSize: 14, fontWeight: 'bold', color: '#F57C00' },
  debugText: { fontSize: 14, color: '#5D4037', fontFamily: 'monospace' },

  resultContainer: { width: '100%', backgroundColor: 'white', padding: 20, borderRadius: 16, marginTop: 20, elevation: 2 },
  resultTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 10 },
  scoreRow: { backgroundColor: '#FFF3E0', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  scoreValue: { fontSize: 32, color: '#FF9800', fontWeight: '900' },
  resultText: { fontSize: 16, color: '#34495E', lineHeight: 24 }
});