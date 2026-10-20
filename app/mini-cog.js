// app/mini-cog.js
// Mini-Cog 快速篩檢：記三個詞 → 畫鐘（沿用手繪畫鐘頁面）→ 回想三個詞 → 結果。
// 計分規則在 utils/miniCog.js；跨畫面的進行狀態在 utils/miniCogSession.js。
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SavedNotice, TesterBar } from '../components/TesterBar';
import { Banner, Button, Card, Chip, KeyValue } from '../components/ui';
import { accents, colors, radius, shadow, space, type } from '../constants/theme';
import { CUTOFF, MAX_LEARN_TRIALS, pickWordList, recallChoices, scoreMiniCog, SENSITIVE_CUTOFF } from '../utils/miniCog';
import { endMiniCog, getMiniCog, startMiniCog, updateMiniCog } from '../utils/miniCogSession';
import { profileStore } from '../utils/profiles';
import { miniCogSummary } from '../utils/resultSummary';

const ACCENT = accents.minicog;

const MODES = {
  examiner: { label: '有人陪同施測', desc: '由家人或施測者唸詞、記錄答案（官方做法）' },
  self: { label: '自己作答', desc: '自己看詞、從選項中選答案（比較容易，分數僅供參考）' },
};

export default function MiniCogScreen() {
  const [phase, setPhase] = useState('intro'); // intro → learn → drawing → recall → result
  const [mode, setMode] = useState('examiner');
  const [session, setSession] = useState(null);
  const [score, setScore] = useState(null);
  const [saved, setSaved] = useState(undefined);

  // 從畫鐘頁回來時：有畫鐘結果就進入回想
  useFocusEffect(
    useCallback(() => {
      const s = getMiniCog();
      if (phase === 'drawing' && s?.clock) {
        setSession(s);
        setPhase('recall');
      }
    }, [phase])
  );

  const begin = () => {
    const activeId = profileStore.getState().activeId;
    const last = activeId ? profileStore.resultsFor(activeId, 'minicog')[0] : null; // 避免連續兩次用同一組詞
    setSession(startMiniCog(pickWordList(Math.random, last?.wordVersion ?? null), mode));
    setScore(null);
    setSaved(undefined);
    setPhase('learn');
  };

  const goDraw = () => {
    setPhase('drawing');
    router.push({ pathname: '/canvas-drawing', params: { flow: 'minicog' } });
  };

  const skipDrawing = () => {
    setSession(updateMiniCog({ clock: { skipped: true } }));
    setPhase('recall');
  };

  const finish = recalled => {
    const s = getMiniCog();
    const clock = s.clock?.skipped ? null : s.clock;
    const result = scoreMiniCog({ recalled, words: s.list.zh, clock, selfAnswered: s.mode === 'self' });
    setScore({ ...result, words: s.list.zh, recalled, version: s.list.version, mode: s.mode });
    setSaved(profileStore.addResult(miniCogSummary(result, { version: s.list.version, mode: s.mode })));
    endMiniCog();
    setPhase('result');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Mini-Cog 快速篩檢' }} />
      {phase !== 'result' && <Steps phase={phase} />}
      {phase === 'intro' && <Intro mode={mode} setMode={setMode} onStart={begin} />}
      {phase === 'learn' && session && <Learn session={session} onDone={goDraw} />}
      {phase === 'drawing' && <Drawing onRetry={goDraw} onSkip={skipDrawing} />}
      {phase === 'recall' && session && <Recall session={session} onDone={finish} />}
      {phase === 'result' && score && <Result score={score} saved={saved} onRestart={() => setPhase('intro')} />}
    </ScrollView>
  );
}

function Steps({ phase }) {
  const steps = [['learn', '記三個詞'], ['drawing', '畫鐘'], ['recall', '回想']];
  const idx = steps.findIndex(s => s[0] === phase);
  return (
    <View style={styles.steps}>
      {steps.map(([key, label], i) => {
        const done = idx > i, on = idx === i;
        return (
          <View key={key} style={styles.step}>
            <View style={[styles.stepDot, (done || on) && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
              {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={[styles.stepNum, on && { color: '#fff' }]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, on && { color: colors.ink, fontWeight: '800' }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Intro({ mode, setMode, onStart }) {
  return (
    <>
      <TesterBar />
      <Text style={styles.title}>Mini-Cog 快速篩檢</Text>
      <Text style={styles.body}>
        臨床常用的失智症快速篩檢，約 3 分鐘：先記住三個詞，接著畫一個時鐘，最後回想剛才的三個詞。
      </Text>
      <Card style={{ marginTop: space.lg }}>
        <Text style={styles.cardTitle}>作答方式</Text>
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {Object.entries(MODES).map(([key, m]) => (
            <Card key={key} onPress={() => setMode(key)} style={[styles.modeCard, mode === key && { borderColor: ACCENT }]}>
              <Ionicons name={mode === key ? 'radio-button-on' : 'radio-button-off'} size={24} color={mode === key ? ACCENT : colors.inkFaint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modeLabel}>{m.label}</Text>
                <Text style={styles.modeDesc}>{m.desc}</Text>
              </View>
            </Card>
          ))}
        </View>
      </Card>
      <Button title="開始" icon="play" color={ACCENT} onPress={onStart} style={styles.primary} />
      <Text style={styles.caption}>
        Mini-Cog © S. Borson（mini-cog.com）。中文詞語為本專題翻譯。結果僅供參考，不能取代醫療診斷。
      </Text>
    </>
  );
}

function WordCards({ words }) {
  return (
    <View style={styles.words}>
      {words.map(w => (
        <View key={w} style={styles.wordCard}>
          <Text style={styles.wordText}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

function Learn({ session, onDone }) {
  const [trials, setTrials] = useState(1);
  const examiner = session.mode === 'examiner';
  return (
    <>
      <Text style={styles.title}>第 1 步：記住三個詞</Text>
      <Text style={styles.body}>
        {examiner
          ? '請慢慢唸這三個詞給受測者聽，再請他複誦一次。告訴他：「等一下會請你再說出來。」'
          : '請大聲唸出這三個詞，並記住它們。等一下會請你選出來。'}
      </Text>
      <WordCards words={session.list.zh} />
      {examiner ? (
        <>
          <Text style={styles.small}>第 {trials} 次（最多 {MAX_LEARN_TRIALS} 次）</Text>
          <Button title="複誦正確，下一步" icon="checkmark" color={ACCENT} onPress={onDone} style={styles.primary} />
          {trials < MAX_LEARN_TRIALS ? (
            <Button title="沒複誦出來，再唸一次" variant="secondary" color={ACCENT} onPress={() => setTrials(t => t + 1)} style={{ marginTop: space.md }} />
          ) : (
            <Button title="試了 3 次仍無法複誦，繼續下一步" variant="secondary" color={ACCENT} onPress={onDone} style={{ marginTop: space.md }} />
          )}
        </>
      ) : (
        <Button title="我記住了，下一步" icon="checkmark" color={ACCENT} onPress={onDone} style={styles.primary} />
      )}
      <Text style={styles.caption}>下一步是畫鐘。畫鐘時這三個詞會先隱藏起來。</Text>
    </>
  );
}

function Drawing({ onRetry, onSkip }) {
  return (
    <>
      <Text style={styles.title}>第 2 步：畫鐘</Text>
      <Text style={styles.body}>還沒完成畫鐘。畫完按「送出分析」，再按「下一步：回想三個詞」就會回到這裡。</Text>
      <Button title="回到畫鐘" icon="create-outline" color={ACCENT} onPress={onRetry} style={styles.primary} />
      <Button title="無法畫鐘，跳過（畫鐘記 0 分）" variant="secondary" color={ACCENT} onPress={onSkip} style={{ marginTop: space.md }} />
      <Text style={styles.caption}>官方規則：三分鐘內沒有畫完，就直接進行回想。</Text>
    </>
  );
}

function Recall({ session, onDone }) {
  const examiner = session.mode === 'examiner';
  const choices = useMemo(() => (examiner ? session.list.zh : recallChoices(session.list)), [session, examiner]);
  const [picked, setPicked] = useState([]);
  const toggle = w => setPicked(p => (p.includes(w) ? p.filter(x => x !== w) : examiner || p.length < 3 ? [...p, w] : p));
  return (
    <>
      <Text style={styles.title}>第 3 步：回想三個詞</Text>
      <Text style={styles.body}>
        {examiner
          ? '請受測者說出剛才的三個詞，不要給任何提示。點選他說對的詞（順序不重要）：'
          : '剛才請你記住的三個詞是哪些？請選出 3 個。'}
      </Text>
      <View style={styles.choices}>
        {choices.map(w => (
          <Chip key={w} label={w} selected={picked.includes(w)} color={ACCENT} onPress={() => toggle(w)} />
        ))}
      </View>
      {examiner
        ? <Text style={styles.small}>畫面上有答案，請由施測者拿著手機，不要讓受測者看到。</Text>
        : <Text style={styles.small}>已選 {picked.length} / 3</Text>}
      <Button title={examiner ? `完成（說對 ${picked.length} 個）` : '完成'} icon="checkmark" color={ACCENT} onPress={() => onDone(picked)} style={styles.primary} />
      <Button title="都想不起來" variant="secondary" color={ACCENT} onPress={() => onDone([])} style={{ marginTop: space.md }} />
    </>
  );
}

function Result({ score, saved, onRestart }) {
  const kind = score.positive ? 'bad' : score.sensitivePositive ? 'warn' : 'good';
  const verdict = score.positive ? '建議進一步評估' : score.sensitivePositive ? '建議留意、定期追蹤' : '篩檢結果正常';
  return (
    <>
      <SavedNotice saved={saved} />
      <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
        <Text style={styles.cardTitle}>Mini-Cog 總分</Text>
        <Text style={styles.total}>{score.total}<Text style={styles.totalMax}> / 5</Text></Text>
        <View style={{ alignSelf: 'stretch', marginTop: space.md }}>
          <Banner kind={kind}>{verdict}</Banner>
        </View>
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <KeyValue label="回想三個詞" value={`${score.recall} / 3 分`} />
        <View style={styles.recallRow}>
          {score.words.map(w => {
            const ok = score.recalled.includes(w);
            return (
              <View key={w} style={[styles.recallChip, { backgroundColor: ok ? colors.goodSoft : colors.neutralSoft }]}>
                <Ionicons name={ok ? 'checkmark' : 'close'} size={16} color={ok ? colors.good : colors.inkFaint} />
                <Text style={[styles.recallText, { color: ok ? colors.good : colors.inkSoft }]}>{w}</Text>
              </View>
            );
          })}
        </View>
        <KeyValue label="畫鐘" value={`${score.clockPoints} / 2 分（${score.clockNormal ? '正常' : '不正常'}）`} last={score.clockNormal} />
        {!score.clockNormal && score.clockReasons.map(r => <Text key={r} style={styles.reason}>・{r}</Text>)}
      </Card>

      <Card style={{ marginTop: space.lg }}>
        {score.notes.map(n => <Text key={n} style={styles.note}>・{n}</Text>)}
        <Text style={styles.caption}>
          判讀：總分低於 {CUTOFF} 分是已驗證的失智症篩檢切點；需要更高敏感度時，低於 {SENSITIVE_CUTOFF} 分就建議進一步評估。
          許多有輕度認知障礙的人仍可能拿到較高分，分數正常不代表一定沒有問題。
        </Text>
        <Text style={styles.caption}>
          畫鐘依 Mini-Cog 規則計分：數字依序、位置大致正確，指針指向 11 和 2 即為正常（不看指針長短，和 MoCA 不同）。
        </Text>
        <Text style={styles.caption}>Mini-Cog © S. Borson。本 App 結果僅供參考，不能取代醫療診斷。</Text>
      </Card>

      <Button title="重新測驗" icon="refresh" color={ACCENT} onPress={onRestart} style={styles.primary} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },

  steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xl, paddingHorizontal: space.sm },
  step: { alignItems: 'center', gap: 6, flex: 1 },
  stepDot: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  stepNum: { fontSize: 15, fontWeight: '800', color: colors.inkFaint },
  stepLabel: { fontSize: 14, color: colors.inkFaint, fontWeight: '600' },

  title: { ...type.title, fontSize: 24, textAlign: 'center' },
  body: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginTop: space.md },
  small: { ...type.small, textAlign: 'center', marginTop: space.lg },
  caption: { ...type.caption, marginTop: space.lg },
  cardTitle: { ...type.subtitle },

  modeCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 2, borderColor: colors.line, padding: space.md, ...shadow, elevation: 0, shadowOpacity: 0 },
  modeLabel: { fontSize: 18, fontWeight: '800', color: colors.ink },
  modeDesc: { ...type.small, fontSize: 14, marginTop: 2 },
  primary: { marginTop: space.xl, minHeight: 60 },

  words: { gap: space.md, marginTop: space.xl },
  wordCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 22, alignItems: 'center', borderWidth: 2, borderColor: colors.line, ...shadow },
  wordText: { fontSize: 40, fontWeight: '900', color: colors.ink, letterSpacing: 6 },

  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', marginTop: space.xl },

  total: { fontSize: 64, fontWeight: '900', color: colors.ink, marginTop: space.sm },
  totalMax: { fontSize: 26, color: colors.inkFaint, fontWeight: '700' },
  recallRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, flexWrap: 'wrap' },
  recallChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  recallText: { fontSize: 16, fontWeight: '700' },
  reason: { ...type.small, marginTop: 4 },
  note: { ...type.body, fontSize: 16, color: colors.ink, marginBottom: 4 },
});
