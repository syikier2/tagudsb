// app/trail-making.js
// 連線測驗（Trail Making Test）：
//   A 部分 1 → 2 → … → 12，B 部分 1 → 甲 → 2 → 乙 → … → 5 → 戊。
// 用手指拖曳依序連線；碰到正確的下一個圓圈自動連上，碰到錯的記一次錯誤。
// 核心邏輯（版面、連線判斷、結果）在 utils/trailMaking.js。
import { Stack } from 'expo-router';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PanResponder, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWindowSize } from '../hooks/useWindowSize';
import { SavedNotice, TesterBar } from '../components/TesterBar';
import { Banner, Button, Chip } from '../components/ui';
import { accents, colors, radius, shadow, type } from '../constants/theme';
import { DISCLAIMER } from '../utils/clockScoring';
import { profileStore } from '../utils/profiles';
import { trailSummary } from '../utils/resultSummary';
import { getTrailLayoutMode, setTrailLayoutMode, subscribeSettings } from '../utils/settings';
import {
  ASPECT, createSession, layoutsFor, NODE_RADIUS, PART_A, PART_B,
  partResult, summarize, touchDown, touchMove, touchUp,
} from '../utils/trailMaking';

// 網頁版：用滑鼠拖曳時不要選取到文字、用手指拖曳時不要捲動頁面
const WEB_NO_SELECT = Platform.OS === 'web' ? { userSelect: 'none', touchAction: 'none', cursor: 'pointer' } : null;

const BLUE = accents.trail;   // 已連上的圓圈與線
const GREEN = colors.good;

const PARTS = {
  A: {
    title: 'A 部分：數字連線',
    steps: ['從「1」開始，用手指依序連到「12」：', `${PART_A.slice(0, 4).join(' → ')} → … → 12`],
  },
  B: {
    title: 'B 部分：數字與天干交替',
    steps: ['數字和天干輪流連，從「1」開始：', `${PART_B.slice(0, 6).join(' → ')} → … → 戊`],
  },
};

export default function TrailMakingScreen() {
  const [phase, setPhase] = useState('introA'); // introA → runA → introB → runB → result
  const [results, setResults] = useState({ A: null, B: null });
  const [saved, setSaved] = useState(undefined);
  const [layouts, setLayouts] = useState(null); // 這次測驗的 A、B 版面（按下開始時產生）

  const start = () => {
    setLayouts(layoutsFor(getTrailLayoutMode()));
    setPhase('runA');
  };

  const restart = () => {
    setResults({ A: null, B: null });
    setSaved(undefined);
    setLayouts(null);
    setPhase('introA');
  };

  const finishB = r => {
    setResults(prev => ({ ...prev, B: r }));
    // 存到目前受測者的歷史紀錄（沒有選擇受測者就不存）
    setSaved(profileStore.addResult(trailSummary(results.A, r, summarize(results.A, r), layouts)));
    setPhase('result');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '連線測驗' }} />
      {phase === 'introA' && <Intro part="A" onStart={start} />}
      {phase === 'runA' && (
        <Board
          key="A"
          part="A"
          layout={layouts.A}
          onDone={r => { setResults(prev => ({ ...prev, A: r })); setPhase('introB'); }}
        />
      )}
      {phase === 'introB' && <Intro part="B" previous={results.A} onStart={() => setPhase('runB')} />}
      {phase === 'runB' && (
        <Board
          key="B"
          part="B"
          layout={layouts.B}
          onDone={finishB}
        />
      )}
      {phase === 'result' && <Result a={results.A} b={results.B} layouts={layouts} saved={saved} onRestart={restart} />}
    </View>
  );
}

function Intro({ part, previous, onStart }) {
  const { title, steps } = PARTS[part];
  const mode = useSyncExternalStore(subscribeSettings, getTrailLayoutMode, getTrailLayoutMode);
  return (
    <ScrollView contentContainerStyle={styles.introWrap}>
      {!previous && <TesterBar />}
      {previous && (
        <View style={{ alignSelf: 'stretch', marginBottom: 20 }}>
          <Banner kind="good">A 部分完成！接下來是 B 部分</Banner>
        </View>
      )}
      <Text style={styles.introTitle}>{title}</Text>
      {steps.map(s => <Text key={s} style={styles.introText}>{s}</Text>)}
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>・盡量連得又快又正確</Text>
        <Text style={styles.tipText}>・手指盡量不要離開螢幕</Text>
        <Text style={styles.tipText}>・不小心放開了，從最後連到的圓圈繼續就好</Text>
      </View>
      {!previous && (
        <View style={styles.modeBox}>
          <Text style={styles.modeTitle}>圓圈位置</Text>
          <View style={styles.modeChips}>
            <Chip label="每次不同" selected={mode === 'random'} color={accents.trail} onPress={() => setTrailLayoutMode('random')} />
            <Chip label="標準版面" selected={mode === 'standard'} color={accents.trail} onPress={() => setTrailLayoutMode('standard')} />
          </View>
          <Text style={styles.modeNote}>
            {mode === 'random'
              ? '每次重新排列，避免記住位置；路線總長度和標準版面相差 8% 以內，難度相近。'
              : '每次都是同一個版面，適合需要嚴格前後比較時使用（多測幾次可能會記住位置）。'}
          </Text>
        </View>
      )}
      <Button title="開始" icon="play" color={accents.trail} onPress={onStart} style={styles.primaryButton} />
    </ScrollView>
  );
}

/** 畫一條線段（用旋轉的 View，不需要額外套件） */
function Segment({ from, to, color, thickness = 5 }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (from.x + to.x) / 2 - len / 2,
        top: (from.y + to.y) / 2 - thickness / 2,
        width: len,
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function Board({ part, layout, onDone }) {
  const { width, height } = useWindowSize();
  const boardW = Math.max(0, Math.min(width - 32, (height - 220) / ASPECT));
  const boardH = boardW * ASPECT;
  const nodeSize = NODE_RADIUS * 2 * boardW;

  const session = useRef(createSession(layout));
  const [, setTick] = useState(0);
  const [finger, setFinger] = useState(null);     // 手指位置（像素），畫「還沒連上」的那段線
  const [flash, setFlash] = useState(-1);         // 連錯時閃紅的圓圈
  const [hint, setHint] = useState('');
  const flashTimer = useRef(null);
  const origin = useRef({ x: 0, y: 0 });         // 版面左上角在螢幕上的位置

  const toBoard = (x, y) => ({ x: x / boardW, y: y / boardW }); // 像素 → 版面座標
  const px = n => ({ x: n.x * boardW, y: n.y * boardW });

  const handleEvent = ev => {
    if (!ev) return;
    if (ev.type === 'error') {
      setFlash(ev.index);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(-1), 500);
    } else if (ev.type === 'wrongStart') {
      setHint('請從「1」開始');
    } else if (ev.type === 'needResume') {
      setHint(`請從「${layout[ev.index].label}」繼續連`);
    } else if (ev.type === 'start' || ev.type === 'resume' || ev.type === 'connect') {
      setHint('');
    } else if (ev.type === 'finish') {
      setHint('');
      setFinger(null);
      const result = partResult(session.current);
      setTimeout(() => onDone(result), 600); // 讓最後一段線顯示一下再進下一步
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => {
          // 記下版面左上角在螢幕上的位置；之後一律用 pageX/pageY 換算。
          // （移動時的 locationX 在網頁版、以及手指滑到其他元件上時，不一定是相對於版面）
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          origin.current = { x: pageX - locationX, y: pageY - locationY };
          const r = touchDown(session.current, toBoard(locationX, locationY), Date.now());
          session.current = r.state;
          if (r.state.active) setFinger({ x: locationX, y: locationY });
          handleEvent(r.event);
          setTick(t => t + 1);
        },
        onPanResponderMove: e => {
          const locationX = e.nativeEvent.pageX - origin.current.x;
          const locationY = e.nativeEvent.pageY - origin.current.y;
          const r = touchMove(session.current, toBoard(locationX, locationY), Date.now());
          session.current = r.state;
          setFinger(r.state.active ? { x: locationX, y: locationY } : null);
          if (r.event) { handleEvent(r.event); setTick(t => t + 1); }
        },
        onPanResponderRelease: () => {
          session.current = touchUp(session.current).state;
          setFinger(null);
          setTick(t => t + 1);
        },
        onPanResponderTerminate: () => {
          session.current = touchUp(session.current).state;
          setFinger(null);
          setTick(t => t + 1);
        },
      }),
    // boardW 改變（例如旋轉螢幕）時重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardW]
  );

  const s = session.current;
  const last = s.path.length ? px(layout[s.path[s.path.length - 1]]) : null;

  return (
    <View style={styles.boardScreen}>
      <Text style={styles.boardTitle}>{PARTS[part].title}</Text>
      <Text style={styles.progress}>已連 {s.path.length} / {layout.length}</Text>

      <View style={[styles.board, WEB_NO_SELECT, { width: boardW, height: boardH }]} {...responder.panHandlers}>
        {/* 已連好的線 */}
        {s.path.slice(1).map((idx, k) => (
          <Segment key={idx} from={px(layout[s.path[k]])} to={px(layout[idx])} color={BLUE} />
        ))}
        {/* 正在拖曳的那一段 */}
        {last && finger && <Segment from={last} to={finger} color="rgba(79,95,168,0.4)" />}

        {layout.map((n, i) => {
          const p = px(n);
          const connected = s.path.includes(i);
          const wrong = flash === i;
          return (
            <View
              key={i}
              pointerEvents="none"
              style={[
                styles.node,
                { width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2, left: p.x - nodeSize / 2, top: p.y - nodeSize / 2 },
                connected && styles.nodeConnected,
                wrong && styles.nodeWrong,
              ]}
            >
              <Text selectable={false} style={[styles.nodeText, { fontSize: nodeSize * 0.4 }, (connected || wrong) && styles.nodeTextOn]}>
                {n.label}
              </Text>
              {(i === 0 || i === layout.length - 1) && (
                <Text selectable={false} style={[styles.nodeTag, { top: -20 }]}>{i === 0 ? '開始' : '結束'}</Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.hint}>{hint || ' '}</Text>
    </View>
  );
}

function Row({ label, a, b }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.cell, styles.cellLabel]}>{label}</Text>
      <Text style={styles.cell}>{a}</Text>
      <Text style={styles.cell}>{b}</Text>
    </View>
  );
}

function Result({ a, b, layouts, saved, onRestart }) {
  const sum = summarize(a, b);
  const fmt = r => (r.completed ? `${r.durationSec.toFixed(1)} 秒` : '未完成');
  return (
    <ScrollView contentContainerStyle={styles.resultWrap}>
      <SavedNotice saved={saved} />
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>連線測驗結果</Text>
        <Row label="" a="A 部分" b="B 部分" />
        <Row label="完成時間" a={fmt(a)} b={fmt(b)} />
        <Row label="連錯次數" a={`${a.errors} 次`} b={`${b.errors} 次`} />
        <Row label="手指放開" a={`${a.lifts} 次`} b={`${b.lifts} 次`} />
        {sum.ratio != null && (
          <View style={styles.ratioBox}>
            <Text style={styles.ratioLabel}>B / A 時間比</Text>
            <Text style={styles.ratioValue}>{sum.ratio.toFixed(1)}</Text>
          </View>
        )}
        <View style={styles.mocaBox}>
          <Text style={[styles.mocaIcon, { color: sum.mocaPass ? GREEN : colors.bad }]}>{sum.mocaPass ? '✓' : '✗'}</Text>
          <Text style={styles.mocaText}>參考 MoCA 連線題：B 部分依序連完且沒有連錯</Text>
        </View>
        {sum.notes.map(n => <Text key={n} style={styles.note}>・{n}</Text>)}
        <Text style={styles.explain}>
          A 部分主要反映處理速度，B 部分還需要在數字和天干之間切換，反映注意力轉換與執行功能。
          B/A 時間比可以排除「手比較慢」的影響，比值越高，代表切換越吃力。
        </Text>
        <Text style={styles.explain}>
          本 App 的題目比臨床標準版短（A 12 個點、B 10 個點），時間不能直接和臨床常模比較，
          適合用來追蹤同一個人前後的變化。
        </Text>
        <Text style={styles.explain}>
          {layouts?.mode === 'random'
            ? `本次版面：每次不同（編號 A-${layouts.seedA}、B-${layouts.seedB}），難度與標準版面相近。`
            : '本次版面：標準版面。'}
        </Text>
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </View>
      <Button title="重新測驗" icon="refresh" color={accents.trail} onPress={onRestart} style={styles.primaryButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  introWrap: { padding: 24, paddingTop: 16, alignItems: 'center' },
  introTitle: { ...type.hero, fontSize: 26, marginBottom: 16, marginTop: 12, textAlign: 'center' },
  introText: { fontSize: 19, color: colors.inkSoft, lineHeight: 30, textAlign: 'center' },
  tipBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, marginTop: 24, alignSelf: 'stretch', ...shadow },
  tipText: { fontSize: 17, color: colors.inkSoft, lineHeight: 28 },
  primaryButton: { alignSelf: 'stretch', marginTop: 28, minHeight: 60 },
  modeBox: { alignSelf: 'stretch', marginTop: 20 },
  modeTitle: { ...type.subtitle, fontSize: 17, color: colors.inkSoft, marginBottom: 8 },
  modeChips: { flexDirection: 'row', gap: 8 },
  modeNote: { ...type.caption, marginTop: 8 },

  boardScreen: { flex: 1, alignItems: 'center', paddingTop: 16 },
  boardTitle: { ...type.subtitle, fontSize: 19 },
  progress: { fontSize: 15, color: colors.inkSoft, marginTop: 4, marginBottom: 10 },
  board: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.line, overflow: 'visible' },
  node: { position: 'absolute', borderWidth: 3, borderColor: BLUE, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  nodeConnected: { backgroundColor: BLUE },
  nodeWrong: { backgroundColor: colors.bad, borderColor: colors.bad },
  nodeText: { fontWeight: 'bold', color: colors.ink },
  nodeTextOn: { color: 'white' },
  nodeTag: { position: 'absolute', fontSize: 12, color: '#7F8C8D', fontWeight: 'bold', width: 60, textAlign: 'center' },
  hint: { fontSize: 18, color: colors.bad, fontWeight: 'bold', marginTop: 12, minHeight: 26 },

  resultWrap: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, ...shadow },
  cardTitle: { ...type.title, marginBottom: 12 },
  row: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  cell: { flex: 1, fontSize: 16, color: colors.ink, textAlign: 'center' },
  cellLabel: { textAlign: 'left', color: colors.inkSoft },
  ratioBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 14, marginTop: 14 },
  ratioLabel: { fontSize: 16, color: colors.inkSoft },
  ratioValue: { fontSize: 26, fontWeight: '900', color: BLUE },
  mocaBox: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  mocaIcon: { fontSize: 20, fontWeight: '900', width: 28 },
  mocaText: { fontSize: 16, color: colors.ink, flex: 1 },
  note: { fontSize: 15, color: colors.inkSoft, lineHeight: 24, marginTop: 4 },
  explain: { fontSize: 14, color: colors.inkFaint, lineHeight: 22, marginTop: 12 },
  disclaimer: { fontSize: 12, color: colors.inkFaint, marginTop: 14, lineHeight: 18 },
});
