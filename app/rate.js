// app/rate.js
// 人工評分（盲評）：評分者只看得到畫鐘的圖，看不到 App 的分數、也看不到受測者是誰，
// 依 MoCA 與 Mini-Cog 的規則逐項判斷「通過 / 不通過」。結果在「評分一致性」頁和 App 的判斷比較。
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Button, Card, Chip } from '../components/ui';
import { colors, radius, space, type } from '../constants/theme';
import { notify } from '../utils/dialog';
import { renderDrawing } from '../utils/drawingRender';
import { drawingStore } from '../utils/drawings';
import { clockResultsOf } from '../utils/profileStore';
import { profileStore, useProfiles } from '../utils/profiles';

const QUESTIONS = [
  { key: 'contour', photoOnly: true, title: '輪廓', rule: '圓形完整、只有輕微變形（MoCA）' },
  { key: 'numbers', title: '數字', rule: '1～12 都有，沒有多寫，位置大致在正確的象限（MoCA）' },
  { key: 'hands', title: '指針（MoCA）', rule: '兩根指針，指向 11 點 10 分，時針比分針短，從中心出發' },
  { key: 'minicogClock', title: '畫鐘正常（Mini-Cog）', rule: '數字依序、位置大致正確，指針指向 11 和 2（不看指針長短）' },
];

export default function RateScreen() {
  const state = useProfiles();
  const rater = state.rater;
  const [skipped, setSkipped] = useState([]);
  const [answers, setAnswers] = useState({});
  const [image, setImage] = useState(null); // { uri, loading }

  // 待評：有保存圖、這位評分者還沒評過、這次沒跳過的畫鐘紀錄
  const queue = useMemo(
    () => (rater
      ? clockResultsOf(state.results).filter(r => r.hasDrawing && !r.ratings?.some(x => x.rater === rater) && !skipped.includes(r.id))
      : []),
    [state.results, rater, skipped]
  );
  const current = queue[0] || null;
  const done = rater ? clockResultsOf(state.results).filter(r => r.ratings?.some(x => x.rater === rater)).length : 0;

  useEffect(() => {
    setAnswers({});
    if (!current) { setImage(null); return; }
    let alive = true;
    setImage({ loading: true });
    drawingStore.load(current.id).then(d => {
      if (!alive) return;
      if (!d) setImage({ missing: true });
      else if (d.kind === 'photo') setImage({ uri: `data:image/jpeg;base64,${d.jpeg}` });
      else setImage({ uri: `data:image/bmp;base64,${renderDrawing(d, 360)}` });
    });
    return () => { alive = false; };
  }, [current?.id]);

  const questions = QUESTIONS.filter(q => !q.photoOnly || current?.mode === 'photo');
  const complete = questions.every(q => answers[q.key] != null);

  const save = () => {
    if (!complete) return notify('還有題目沒選', '每一項都要選「通過」或「不通過」。');
    profileStore.addRating(current.id, { rater, ...answers });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '人工評分（盲評）' }} />

      <Card>
        <Text style={styles.label}>評分者代號</Text>
        <TextInput
          value={rater}
          onChangeText={t => profileStore.setRater(t)}
          placeholder="例如：評分者A（同一個人每次用同一個代號）"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          maxLength={20}
        />
        {rater ? <Text style={styles.hint}>你已經評了 {done} 張，還有 {queue.length} 張待評。</Text> : null}
      </Card>

      {!rater ? (
        <View style={{ marginTop: space.lg }}><Banner kind="info">先輸入評分者代號，才會顯示要評分的畫鐘。</Banner></View>
      ) : !current ? (
        <Card style={[styles.center, { marginTop: space.lg }]}>
          <Text style={styles.doneTitle}>{done ? '全部評完了！' : '目前沒有可以評分的畫鐘'}</Text>
          <Text style={styles.hint}>
            {done ? '可以到「評分一致性」看 App 和人工評分的比較。' : '做過的手繪或拍照畫鐘測驗，才會出現在這裡（之前的舊紀錄沒有保存圖）。'}
          </Text>
          <Button title="看評分一致性" onPress={() => router.replace('/agreement')} style={{ marginTop: space.lg, alignSelf: 'stretch' }} />
        </Card>
      ) : (
        <>
          <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
            <Text style={styles.progress}>第 {done + 1} 張・{current.mode === 'photo' ? '紙本拍照' : '手繪'}</Text>
            <View style={styles.imageBox}>
              {image?.loading && <ActivityIndicator size="large" color={colors.primary} />}
              {image?.missing && <Text style={styles.hint}>找不到這張圖</Text>}
              {image?.uri && <Image source={{ uri: image.uri }} style={styles.image} resizeMode="contain" />}
            </View>
            <Text style={styles.hint}>受測者要畫的時間：11 點 10 分</Text>
          </Card>

          {questions.map(q => (
            <Card key={q.key} style={{ marginTop: space.md }}>
              <Text style={styles.qTitle}>{q.title}</Text>
              <Text style={styles.qRule}>{q.rule}</Text>
              <View style={styles.choiceRow}>
                <Chip label="✓ 通過" selected={answers[q.key] === true} color={colors.good} onPress={() => setAnswers(a => ({ ...a, [q.key]: true }))} />
                <Chip label="✗ 不通過" selected={answers[q.key] === false} color={colors.bad} onPress={() => setAnswers(a => ({ ...a, [q.key]: false }))} />
              </View>
            </Card>
          ))}

          <Button title="儲存，下一張" icon="checkmark" onPress={save} disabled={!complete} style={{ marginTop: space.xl, minHeight: 60 }} />
          <Button title="跳過這張" variant="ghost" onPress={() => setSkipped(s => [...s, current.id])} style={{ marginTop: space.sm }} />
          <Text style={styles.footnote}>
            為了公平比較，這裡不會顯示 App 的分數和受測者是誰。請依照規則獨立判斷，不要和其他評分者討論。
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },
  center: { alignItems: 'center' },
  label: { ...type.subtitle, fontSize: 17, marginBottom: space.sm },
  input: {
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
    fontSize: 18, paddingVertical: 10, paddingHorizontal: 14, color: colors.ink,
  },
  hint: { ...type.caption, marginTop: space.sm, textAlign: 'center' },
  doneTitle: { ...type.title },
  progress: { ...type.small, fontWeight: '700' },
  imageBox: {
    width: '100%', aspectRatio: 1, maxWidth: 360, marginTop: space.md, borderRadius: radius.md,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  qTitle: { ...type.subtitle },
  qRule: { ...type.small, marginTop: 2 },
  choiceRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  footnote: { ...type.caption, textAlign: 'center', marginTop: space.lg },
});
