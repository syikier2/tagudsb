// app/history.js
// 目前受測者的歷史紀錄：基本資料、趨勢圖、和上次比較、每一筆紀錄（可展開、可刪除）。
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TrendBars } from '../components/TrendBars';
import { Avatar, Banner, Button, Card, Chip, KeyValue, SectionTitle } from '../components/ui';
import { accents, colors, radius, space, type } from '../constants/theme';
import { educationBonus, profileSubtitle, resultsOf } from '../utils/profileStore';
import { profileStore, useProfiles } from '../utils/profiles';
import { compareWithPrevious, longDate, shortDateTime } from '../utils/resultSummary';
import { confirmDialog } from '../utils/dialog';

// 每一種測驗：分頁名稱、趨勢圖要畫什麼、圖例
const TABS = [
  {
    key: 'minicog', label: 'Mini-Cog', name: 'Mini-Cog', color: accents.minicog, route: '/mini-cog',
    chartTitle: '總分（滿分 5，低於 3 分建議進一步評估）', max: 5,
    bar: r => ({ value: r.total, color: r.positive ? colors.bad : r.sensitivePositive ? colors.partial : colors.good }),
    legend: [[colors.good, '4～5 分'], [colors.partial, '3 分'], [colors.bad, '0～2 分']],
  },
  {
    key: 'clock', label: '畫鐘', name: '畫鐘', color: accents.canvas, route: '/canvas-drawing',
    chartTitle: '數字分數（滿分 5）', max: 5,
    bar: r => ({ value: r.numberScore, color: r.mocaPassed === r.mocaTotal ? colors.good : r.mocaPassed > 0 ? colors.partial : colors.bad }),
    legend: [[colors.good, 'MoCA 畫鐘全部通過'], [colors.partial, '部分通過'], [colors.bad, '都未通過']],
  },
  {
    key: 'trail', label: '連線', name: '連線', color: accents.trail, route: '/trail-making',
    chartTitle: 'B 部分完成時間（越短越好）', max: undefined,
    bar: r => ({ value: r.bSec, valueText: r.bSec == null ? '未完成' : `${Math.round(r.bSec)}秒`, color: r.mocaPass ? colors.good : accents.trail }),
    legend: [[colors.good, 'MoCA 連線題通過'], [accents.trail, '未通過']],
  },
];
const CHART_COUNT = 10; // 趨勢圖顯示最近幾次

const dayLabel = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

export default function HistoryScreen() {
  const state = useProfiles();
  const active = state.profiles.find(p => p.id === state.activeId) || null;
  const [tab, setTab] = useState('minicog');
  const cfg = TABS.find(t => t.key === tab);
  const [open, setOpen] = useState(null);

  const records = useMemo(
    () => (active ? resultsOf(state.results, active.id, tab) : []),
    [active, tab, state.results]
  );
  const counts = useMemo(() => {
    const mine = active ? state.results.filter(r => r.profileId === active.id) : [];
    return Object.fromEntries(TABS.map(t => [t.key, mine.filter(r => r.type === t.key).length]));
  }, [active, state.results]);

  if (!active) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: '歷史紀錄' }} />
        <Text style={styles.emptyText}>請先選擇受測者</Text>
        <Button title="選擇受測者" onPress={() => router.replace('/profiles')} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  const chartItems = records.slice(0, CHART_COUNT).reverse().map(r => ({ key: r.id, label: dayLabel(r.at), ...cfg.bar(r) }));
  const compare = compareWithPrevious(records);

  const remove = r => {
    confirmDialog('刪除這筆紀錄？', `${shortDateTime(r.at)} 的${cfg.name}測驗`, { okText: '刪除', destructive: true })
      .then(ok => ok && profileStore.deleteResult(r.id));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '歷史紀錄' }} />

      <Card style={styles.profile}>
        <Avatar name={active.name} seed={active.id} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{active.name}</Text>
          <Text style={styles.sub}>{profileSubtitle(active) || '未填基本資料'}</Text>
          <Text style={styles.meta}>建立於 {longDate(active.createdAt)}・共 {Object.values(counts).reduce((a, b) => a + b, 0)} 筆紀錄</Text>
        </View>
        <Pressable
          hitSlop={12}
          onPress={() => router.push({ pathname: '/profile-edit', params: { id: active.id } })}
          accessibilityLabel="編輯基本資料"
        >
          <Ionicons name="create-outline" size={24} color={colors.inkSoft} />
        </Pressable>
      </Card>

      <View style={styles.tabs}>
        {TABS.map(t => (
          <Chip key={t.key} label={`${t.label}（${counts[t.key]}）`} selected={tab === t.key} color={t.color}
            onPress={() => { setTab(t.key); setOpen(null); }} />
        ))}
      </View>

      {records.length === 0 ? (
        <Card style={styles.center}>
          <Ionicons name="document-text-outline" size={40} color={colors.inkFaint} />
          <Text style={styles.emptyText}>還沒有{cfg.name}測驗的紀錄</Text>
          <Button
            title={`開始${cfg.name}測驗`}
            compact
            color={cfg.color}
            onPress={() => router.push(cfg.route)}
            style={{ marginTop: space.md }}
          />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.cardTitle}>{cfg.chartTitle}</Text>
            <Text style={styles.cardSub}>最近 {chartItems.length} 次・由舊到新</Text>
            <View style={{ marginTop: space.lg }}>
              <TrendBars items={chartItems} max={cfg.max} color={cfg.color} />
            </View>
            <View style={styles.legend}>
              {cfg.legend.map(([c, l]) => <Legend key={l} color={c} label={l} />)}
            </View>
            {compare && <View style={{ marginTop: space.md }}><Banner kind="info" icon="swap-vertical">{compare}</Banner></View>}
          </Card>

          <SectionTitle>所有紀錄</SectionTitle>
          <View style={{ gap: space.sm }}>
            {records.map(r => (
              <RecordRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDelete={() => remove(r)} />
            ))}
          </View>
        </>
      )}

      {educationBonus(active) > 0 && (
        <Text style={styles.footnote}>此受測者教育程度為 6 年以下；若日後進行完整 MoCA，總分需加 1 分。</Text>
      )}
      <Text style={styles.footnote}>結果僅供參考，不能取代醫療診斷。分數下降時，建議與醫師討論。</Text>
    </ScrollView>
  );
}

function Legend({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const MODE = { canvas: '手機手繪', photo: '紙本拍照' };

const RECALL_MODE = { examiner: '有人陪同', self: '自己作答' };

function RecordRow({ r, open, onToggle, onDelete }) {
  if (r.type === 'minicog') return <MiniCogRow r={r} open={open} onToggle={onToggle} onDelete={onDelete} />;
  const clock = r.type === 'clock';
  const pass = clock ? r.mocaPassed === r.mocaTotal : r.mocaPass;
  return (
    <Card style={styles.record}>
      <Pressable onPress={onToggle} style={styles.recordHead} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={styles.recordDate}>{shortDateTime(r.at)}</Text>
          <Text style={styles.recordMode}>{clock ? MODE[r.mode] : `A ${fmtSec(r.aSec)}・B ${fmtSec(r.bSec)}`}</Text>
        </View>
        {clock ? (
          <Text style={styles.recordScore}>{r.numberScore}<Text style={styles.recordMax}> / {r.numberMax}</Text></Text>
        ) : (
          <Text style={styles.recordScore}>{r.ratio != null ? r.ratio.toFixed(1) : '—'}<Text style={styles.recordMax}> 倍</Text></Text>
        )}
        <View style={[styles.passPill, { backgroundColor: pass ? colors.goodSoft : colors.neutralSoft }]}>
          <Text style={[styles.passText, { color: pass ? colors.good : colors.inkSoft }]}>
            {clock ? `MoCA ${r.mocaPassed}/${r.mocaTotal}` : pass ? 'MoCA 通過' : '未通過'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
      </Pressable>

      {open && (
        <View style={styles.detail}>
          {clock ? (
            <>
              <KeyValue label="辨識到的數字" value={`${r.found} / 12`} />
              <KeyValue label="位置正確" value={`${r.correct} 個`} />
              {r.missing?.length > 0 && <KeyValue label="缺少" value={r.missing.join('、')} />}
              {r.items.contour != null && <KeyValue label="輪廓" value={r.items.contour ? '✓ 通過' : '✗ 未通過'} />}
              <KeyValue label="數字" value={r.items.numbers ? '✓ 通過' : '✗ 未通過'} />
              <KeyValue label="指針" value={r.items.hands ? '✓ 通過' : '✗ 未通過'} />
              {r.durationSec != null && <KeyValue label="作畫時間" value={`${Math.round(r.durationSec)} 秒`} />}
              {r.cloudAsked != null && <KeyValue label="雲端輔助" value={`${r.cloudAsked} 個字`} last />}
            </>
          ) : (
            <>
              <KeyValue label="A 部分" value={`${fmtSec(r.aSec)}・連錯 ${r.aErrors} 次`} />
              <KeyValue label="B 部分" value={`${fmtSec(r.bSec)}・連錯 ${r.bErrors} 次`} />
              <KeyValue label="B / A 時間比" value={r.ratio != null ? r.ratio.toFixed(2) : '—'} />
              <KeyValue label="手指放開" value={`${r.lifts} 次`} />
              <KeyValue label="版面" value={r.layoutMode === 'random' ? `每次不同（A-${r.seedA}、B-${r.seedB}）` : '標準版面'} last />
            </>
          )}
          <Button title="刪除這筆紀錄" variant="danger" compact icon="trash-outline" onPress={onDelete} style={{ marginTop: space.md }} />
        </View>
      )}
    </Card>
  );
}

function MiniCogRow({ r, open, onToggle, onDelete }) {
  const tone = r.positive ? [colors.badSoft, colors.bad, '建議評估'] : r.sensitivePositive ? [colors.warnSoft, colors.warn, '留意追蹤'] : [colors.goodSoft, colors.good, '正常'];
  return (
    <Card style={styles.record}>
      <Pressable onPress={onToggle} style={styles.recordHead} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={styles.recordDate}>{shortDateTime(r.at)}</Text>
          <Text style={styles.recordMode}>{`回想 ${r.recall}/3・畫鐘 ${r.clockPoints}/2・${RECALL_MODE[r.recallMode] ?? ''}`}</Text>
        </View>
        <Text style={styles.recordScore}>{r.total}<Text style={styles.recordMax}> / 5</Text></Text>
        <View style={[styles.passPill, { backgroundColor: tone[0] }]}>
          <Text style={[styles.passText, { color: tone[1] }]}>{tone[2]}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
      </Pressable>
      {open && (
        <View style={styles.detail}>
          <KeyValue label="回想三個詞" value={`${r.recall} / 3`} />
          <KeyValue label="畫鐘" value={`${r.clockPoints} / 2（${r.clockNormal ? '正常' : '不正常'}）`} />
          <KeyValue label="作答方式" value={RECALL_MODE[r.recallMode] ?? '—'} />
          <KeyValue label="詞組" value={`第 ${r.wordVersion} 組`} last />
          <Button title="刪除這筆紀錄" variant="danger" compact icon="trash-outline" onPress={onDelete} style={{ marginTop: space.md }} />
        </View>
      )}
    </Card>
  );
}

const fmtSec = s => (s == null ? '未完成' : `${s.toFixed(1)} 秒`);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyText: { ...type.body, color: colors.inkSoft, marginTop: space.sm, textAlign: 'center' },

  profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  name: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { ...type.small, marginTop: 2 },
  meta: { ...type.caption, marginTop: 2 },

  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.lg },
  cardTitle: { ...type.subtitle },
  cardSub: { ...type.caption, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, color: colors.inkSoft },

  record: { paddingVertical: space.md },
  recordHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  recordDate: { fontSize: 17, fontWeight: '800', color: colors.ink },
  recordMode: { ...type.caption, fontSize: 14, marginTop: 1 },
  recordScore: { fontSize: 24, fontWeight: '900', color: colors.ink },
  recordMax: { fontSize: 14, fontWeight: '700', color: colors.inkFaint },
  passPill: { borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  passText: { fontSize: 13, fontWeight: '800' },
  detail: { marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.xs },

  footnote: { ...type.caption, textAlign: 'center', marginTop: space.lg },
});
