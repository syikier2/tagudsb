// app/samples.js
// 辨識樣本收集（開發用）：請自願者畫鐘，把每個數字的筆跡連同「依位置推算的正確答案」存下來，
// 匯出後用來測試、改進辨識（scripts/eval-samples.mjs）。不影響評分，也不會自動改變辨識方式。
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Banner, Button, Card, SectionTitle } from '../components/ui';
import { colors, radius, space, type } from '../constants/theme';
import { sampleStats } from '../utils/sampleCollect';
import { sampleStore, useSamples } from '../utils/samples';
import { confirmDialog, notify } from '../utils/dialog';

const CONSENT =
  '開啟後，每次畫鐘測驗（手繪或拍照）畫得夠完整時，會把每個數字的筆跡存在這台裝置裡，' +
  '用來檢查和改進數字辨識。\n\n' +
  '・只存筆跡形狀和正確答案，不存姓名、照片或受測者資料\n' +
  '・只會存在這台裝置，要匯出才會離開\n' +
  '・請只用在自願幫忙的同學、家人，並先取得他們同意\n' +
  '・正式篩檢時請關閉\n\n' +
  '是否開啟？';

function download(filename, text) {
  // 網頁版：直接下載成檔案
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SamplesScreen() {
  const state = useSamples();
  const stats = sampleStats(state.samples);

  const toggle = on => {
    if (!on) return sampleStore.setEnabled(false);
    confirmDialog('辨識樣本收集', CONSENT, { okText: '開啟' }).then(ok => ok && sampleStore.setEnabled(true));
  };

  const exportAll = async () => {
    const text = JSON.stringify(sampleStore.exportData());
    const d = new Date();
    const name = `samples-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    if (Platform.OS === 'web') return download(name, text);
    try {
      await Share.share({ title: name, message: text });
    } catch (e) {
      notify('匯出失敗', String(e?.message || e));
    }
  };

  const clearAll = () => {
    confirmDialog('刪除全部樣本？', `共 ${stats.total} 個樣本，刪除後無法復原。請先確認已經匯出。`, { okText: '刪除', destructive: true })
      .then(ok => ok && sampleStore.clear());
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '辨識樣本收集' }} />

      <Text style={styles.lead}>
        請自願者畫鐘，App 會依每個數字在鐘面上的位置推算正確答案，把筆跡存下來，用來測試和改進數字辨識。
      </Text>

      <Card style={styles.row}>
        <Ionicons name="albums-outline" size={26} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>收集樣本</Text>
          <Text style={styles.rowSub}>{state.enabled ? '開啟中：畫鐘完成後自動收集' : '關閉中'}</Text>
        </View>
        <Switch value={state.enabled} onValueChange={toggle} trackColor={{ true: colors.primary, false: colors.line }} thumbColor="#FFFFFF" />
      </Card>

      {state.enabled && (
        <Card style={{ marginTop: space.md }}>
          <Text style={styles.label}>志願者代號</Text>
          <TextInput
            value={state.contributor}
            onChangeText={t => sampleStore.setContributor(t)}
            placeholder="例如：同學A（不要填真實姓名）"
            placeholderTextColor={colors.inkFaint}
            style={styles.input}
            maxLength={20}
          />
          <Text style={styles.hint}>換人畫之前先改代號，之後才分得出是誰寫的（評估不同人的準確率時會用到）。</Text>
        </Card>
      )}

      <SectionTitle>已收集 {stats.total} 個樣本（{stats.contributors} 位）</SectionTitle>
      <Card>
        <View style={styles.grid}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
            const t = stats.byTruth[n];
            return (
              <View key={n} style={styles.cell}>
                <Text style={styles.cellNum}>{n}</Text>
                <Text style={styles.cellCount}>{t.count}</Text>
                {t.wrong > 0 && <Text style={styles.cellWrong}>錯 {t.wrong}</Text>}
              </View>
            );
          })}
        </View>
        <Text style={styles.hint}>
          「錯」= 收集當時手機端認成別的數字，這些最有參考價值；加進測試資料前請先人工確認筆跡。
        </Text>
      </Card>

      {stats.total > 0 && (
        <>
          <Button title="匯出全部樣本" icon="share-outline" onPress={exportAll} style={{ marginTop: space.xl }} />
          <Button title="刪除全部樣本" icon="trash-outline" variant="danger" onPress={clearAll} style={{ marginTop: space.md }} />
        </>
      )}

      <View style={{ marginTop: space.xl }}>
        <Banner kind="warn">只收集自願者的筆跡；正式篩檢時請關閉。收集的樣本不會自動改變辨識方式。</Banner>
      </View>
      <Text style={styles.footnote}>
        只會收「畫得夠完整」的鐘（至少 11 個數字位置正確），而且每個數字要靠近某個鐘點的位置，避免存到錯的答案。
        匯出的檔案和 tests/fixtures 的格式相同，可以用 node scripts/eval-samples.mjs 檔名.json 評估準確率。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },
  lead: { ...type.small, marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowTitle: { ...type.subtitle, fontSize: 17 },
  rowSub: { ...type.caption, fontSize: 14, marginTop: 2 },
  label: { ...type.subtitle, fontSize: 17, marginBottom: space.sm },
  input: {
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
    fontSize: 18, paddingVertical: 10, paddingHorizontal: 14, color: colors.ink,
  },
  hint: { ...type.caption, marginTop: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '22%', flexGrow: 1, alignItems: 'center', paddingVertical: 8,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line,
  },
  cellNum: { fontSize: 13, color: colors.inkFaint, fontWeight: '700' },
  cellCount: { fontSize: 22, fontWeight: '900', color: colors.ink },
  cellWrong: { fontSize: 12, color: colors.bad, fontWeight: '700' },
  footnote: { ...type.caption, marginTop: space.lg },
});
