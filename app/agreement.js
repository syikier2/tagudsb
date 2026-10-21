// app/agreement.js
// 評分一致性：App 的判斷和人工評分（盲評）比較，以及評分者之間的比較。可以匯出 CSV 放進報告。
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, SectionTitle } from '../components/ui';
import { colors, space, type } from '../constants/theme';
import { agreementCsv, computeAgreement, kappaLabel } from '../utils/agreement';
import { notify } from '../utils/dialog';
import { clockResultsOf } from '../utils/profileStore';
import { useProfiles } from '../utils/profiles';

const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const k2 = v => (v == null ? '—' : v.toFixed(2));

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Table({ rows, firstCol }) {
  return (
    <View>
      <View style={[styles.tr, styles.th]}>
        <Text style={[styles.td, styles.tdFirst, styles.thText]}>{firstCol}</Text>
        <Text style={[styles.td, styles.thText]}>張數</Text>
        <Text style={[styles.td, styles.thText]}>一致率</Text>
        <Text style={[styles.td, styles.thText]}>kappa</Text>
      </View>
      {rows.map(r => (
        <View key={r.key} style={styles.tr}>
          <Text style={[styles.td, styles.tdFirst]}>{r.name}</Text>
          <Text style={styles.td}>{r.n}</Text>
          <Text style={[styles.td, styles.strong]}>{pct(r.percent)}</Text>
          <Text style={styles.td}>{k2(r.kappa)}{'\n'}<Text style={styles.kLabel}>{kappaLabel(r.kappa)}</Text></Text>
        </View>
      ))}
    </View>
  );
}

export default function AgreementScreen() {
  const state = useProfiles();
  const clocks = useMemo(() => clockResultsOf(state.results), [state.results]);
  const g = useMemo(() => computeAgreement(clocks), [clocks]);
  const withDrawing = clocks.filter(r => r.hasDrawing).length;

  const exportCsv = async () => {
    const csv = agreementCsv(clocks);
    const d = new Date();
    const name = `agreement-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
    if (Platform.OS === 'web') return download(name, csv, 'text/csv');
    try { await Share.share({ title: name, message: csv }); } catch (e) { notify('匯出失敗', String(e?.message || e)); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '評分一致性' }} />

      <Text style={styles.lead}>
        請兩位以上的評分者，在看不到 App 分數的情況下，依規則替同一批畫鐘評分，再比較和 App 的判斷是否一致。
      </Text>

      <Card style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statNum}>{withDrawing}</Text><Text style={styles.statLabel}>可評分的畫鐘</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{g.ratedCount}</Text><Text style={styles.statLabel}>已有人評</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{g.raters.length}</Text><Text style={styles.statLabel}>評分者</Text></View>
      </Card>

      <Button title="開始評分（盲評）" icon="create-outline" onPress={() => router.push('/rate')} style={{ marginTop: space.lg, minHeight: 58 }} />

      {g.ratedCount > 0 && g.ratedCount < 20 && (
        <View style={{ marginTop: space.lg }}><Banner kind="warn">目前只有 {g.ratedCount} 張有人評，建議至少 20～30 張，結果才有參考價值。</Banner></View>
      )}

      {g.raters.map(rater => {
        const rows = g.appVsRater.filter(x => x.rater === rater).map(x => ({ ...x, key: x.item, name: x.label }));
        return (
          <View key={rater}>
            <SectionTitle>App vs 評分者「{rater}」</SectionTitle>
            <Card><Table rows={rows} firstCol="項目" /></Card>
          </View>
        );
      })}

      {g.raterVsRater.length > 0 && (
        <>
          <SectionTitle>評分者之間</SectionTitle>
          <Card>
            <Table rows={g.raterVsRater.map(x => ({ ...x, key: `${x.a}-${x.b}-${x.item}`, name: `${x.a} vs ${x.b}\n${x.label}` }))} firstCol="比較" />
          </Card>
          <Text style={styles.note}>評分者之間的一致性是參考上限：App 和人工的一致性接近這個數字，就代表 App 和真人評得差不多。</Text>
        </>
      )}

      {g.ratedCount > 0 && <Button title="匯出 CSV（Excel 可開）" variant="secondary" icon="download-outline" onPress={exportCsv} style={{ marginTop: space.xl }} />}

      <Card style={{ marginTop: space.xl }}>
        <Text style={styles.cardTitle}>怎麼看這些數字</Text>
        <Text style={styles.note}>・一致率：兩邊判斷相同的比例。</Text>
        <Text style={styles.note}>・kappa：扣掉「碰巧一樣」之後的一致程度，1 代表完全一致、0 代表跟亂猜差不多。判讀參考 Landis & Koch（1977）：0.41～0.6 中等、0.61～0.8 高度、0.81 以上幾乎完全一致。</Text>
        <Text style={styles.note}>・如果某一項大家幾乎都判「通過」，kappa 會很不穩定甚至無法計算，這時看一致率就好，並在報告中說明。</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },
  lead: { ...type.small, marginBottom: space.lg },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 30, fontWeight: '900', color: colors.ink },
  statLabel: { ...type.caption, fontSize: 13 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  th: { paddingVertical: 6 },
  thText: { color: colors.inkFaint, fontWeight: '700', fontSize: 13 },
  td: { flex: 1, fontSize: 15, color: colors.ink, textAlign: 'center' },
  tdFirst: { flex: 1.8, textAlign: 'left' },
  strong: { fontWeight: '800' },
  kLabel: { fontSize: 12, color: colors.inkSoft },
  cardTitle: { ...type.subtitle, marginBottom: space.sm },
  note: { ...type.small, marginTop: space.sm },
});
