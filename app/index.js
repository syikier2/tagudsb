// app/index.js
// 首頁：目前的受測者、三項測驗、歷史紀錄、雲端輔助辨識開關。
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Button, Card, SectionTitle } from '../components/ui';
import { accents, colors, radius, space, type } from '../constants/theme';
import { profileSubtitle } from '../utils/profileStore';
import { profileStore, useProfiles } from '../utils/profiles';
import { shortDateTime } from '../utils/resultSummary';
import { useSamples } from '../utils/samples';
import { cloudAvailable, getCloudAssist, isWeb, setCloudAssist, subscribeSettings } from '../utils/settings';
import { confirmDialog } from '../utils/dialog';

const CONSENT_TEXT =
  '開啟後，畫鐘測驗中手機沒把握的數字（例如 7 和 9 分不清楚），會把「那一個字」單獨畫成小圖，' +
  '送到 Google Cloud Vision 雲端辨識，作為第二意見。\n\n' +
  '・不會上傳整張圖、照片或任何個人資料\n' +
  '・需要網路；沒有網路時自動只用手機端辨識\n' +
  '・最後結果仍以手機端的前兩個候選答案為準\n\n' +
  '是否同意開啟？';

const TESTS = [
  { route: '/mini-cog', icon: 'flash-outline', color: accents.minicog, title: 'Mini-Cog 快速篩檢', desc: '記三個詞＋畫鐘，約 3 分鐘', badge: '推薦' },
  { route: '/canvas-drawing', icon: 'create-outline', color: accents.canvas, title: '在螢幕上畫鐘', desc: '用手指（或滑鼠）直接畫時鐘' },
  { route: '/photo-drawing', icon: 'camera-outline', color: accents.photo, title: '拍攝紙上畫鐘', desc: '拍下在紙上畫好的時鐘' },
  { route: '/trail-making', icon: 'git-network-outline', color: accents.trail, title: '連線測驗', desc: '依序把數字和天干連起來' },
];

export default function Home() {
  const state = useProfiles();
  const active = state.profiles.find(p => p.id === state.activeId) || null;
  const cloudOn = useSyncExternalStore(subscribeSettings, getCloudAssist, getCloudAssist);
  const available = cloudAvailable();
  const samples = useSamples();

  const last = useMemo(
    () => (active ? profileStore.resultsFor(active.id)[0] : null),
    // results 改變時重新計算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, state.results]
  );

  const toggleCloud = (on) => {
    if (!on) return setCloudAssist(false);
    confirmDialog('雲端輔助辨識', CONSENT_TEXT, { okText: '同意開啟' }).then(ok => ok && setCloudAssist(true));
  };

  const pickProfile = () => router.push(state.profiles.length ? '/profiles' : '/profile-edit');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false, title: '大腦健康檢測' }} />

      <Text style={styles.hello}>大腦健康檢測</Text>
      <Text style={styles.helloSub}>畫鐘與連線測驗・認知功能篩檢輔助</Text>

      {/* 目前的受測者 */}
      {state.loaded && (active ? (
        <Card style={styles.profileCard} onPress={() => router.push('/profiles')} accessibilityLabel="切換受測者">
          <Avatar name={active.name} seed={active.id} size={60} />
          <View style={{ flex: 1 }}>
            <Text style={styles.profileLabel}>目前受測者</Text>
            <Text style={styles.profileName} numberOfLines={1}>{active.name}</Text>
            <Text style={styles.profileSub} numberOfLines={2}>
              {[profileSubtitle(active), last && `上次測驗 ${shortDateTime(last.at)}`].filter(Boolean).join('\n')}
            </Text>
          </View>
          <View style={styles.switchPill}>
            <Text style={styles.switchPillText}>切換</Text>
          </View>
        </Card>
      ) : (
        <Card style={styles.emptyProfile}>
          <Ionicons name="person-add-outline" size={30} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>{state.profiles.length ? '選擇受測者' : '先建立受測者'}</Text>
            <Text style={styles.profileSub}>每次測驗結果都會存下來，可以查看變化</Text>
          </View>
          <Button title={state.profiles.length ? '選擇' : '新增'} compact onPress={pickProfile} />
        </Card>
      ))}

      <SectionTitle>選擇測驗</SectionTitle>
      <View style={{ gap: space.md }}>
        {TESTS.map(t => (
          <Card key={t.route} style={styles.testCard} onPress={() => router.push(t.route)} accessibilityLabel={t.title}>
            <View style={[styles.testIcon, { backgroundColor: t.color }]}>
              <Ionicons name={t.icon} size={30} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.testTitle}>{t.title}</Text>
                {t.badge && <Text style={[styles.badge, { color: t.color, borderColor: t.color }]}>{t.badge}</Text>}
              </View>
              <Text style={styles.testDesc}>{t.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={26} color={colors.inkFaint} />
          </Card>
        ))}

        <Card
          style={styles.testCard}
          onPress={() => (active ? router.push('/history') : pickProfile())}
          accessibilityLabel="歷史紀錄"
        >
          <View style={[styles.testIcon, { backgroundColor: accents.history }]}>
            <Ionicons name="stats-chart-outline" size={28} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.testTitle}>歷史紀錄</Text>
            <Text style={styles.testDesc}>{active ? `查看 ${active.name} 的測驗變化` : '先選擇受測者'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={26} color={colors.inkFaint} />
        </Card>
      </View>

      <SectionTitle>設定</SectionTitle>
      <Card style={styles.cloudRow}>
        <Ionicons name="cloud-outline" size={26} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cloudTitle}>雲端輔助辨識</Text>
          <Text style={styles.cloudDesc}>
            {available
              ? cloudOn
                ? '已開啟：畫鐘時沒把握的字會送 Google 雲端確認'
                : '關閉中：全部在手機上辨識，不需網路'
              : isWeb
                ? '網頁版不提供（金鑰會被公開），全部在這台裝置上辨識'
                : '尚未設定 Google Cloud Vision 金鑰，目前只用手機端辨識'}
          </Text>
        </View>
        <Switch
          value={cloudOn}
          onValueChange={toggleCloud}
          disabled={!available}
          trackColor={{ true: colors.primary, false: colors.line }}
          thumbColor="#FFFFFF"
        />
      </Card>

      <Card style={[styles.cloudRow, { marginTop: space.md }]} onPress={() => router.push('/samples')} accessibilityLabel="辨識樣本收集">
        <Ionicons name="albums-outline" size={26} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cloudTitle}>辨識樣本收集（開發用）</Text>
          <Text style={styles.cloudDesc}>
            {samples.enabled ? `收集中・已收 ${samples.samples.length} 個` : '請自願者畫鐘，收集手寫數字來改進辨識'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.inkFaint} />
      </Card>

      <Text style={styles.disclaimer}>本 App 為認知功能篩檢輔助工具，結果僅供參考，不能取代醫療診斷。{'\n'}{isWeb ? '受測者資料只存在這個瀏覽器裡。' : '受測者資料只存在這支手機裡。'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingTop: 64, paddingBottom: 48 },
  hello: { ...type.hero },
  helloSub: { ...type.small, marginTop: 4, marginBottom: space.xl },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  profileLabel: { ...type.caption, fontWeight: '700', letterSpacing: 1 },
  profileName: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 1 },
  profileSub: { ...type.small, fontSize: 14, marginTop: 2, lineHeight: 20 },
  switchPill: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  switchPillText: { color: colors.primaryDark, fontWeight: '800', fontSize: 15 },
  emptyProfile: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 2, borderColor: colors.primarySoft, borderStyle: 'dashed' },
  emptyTitle: { ...type.subtitle },

  testCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.lg },
  testIcon: { width: 58, height: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  testTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  testDesc: { ...type.small, marginTop: 2 },

  cloudRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cloudTitle: { ...type.subtitle, fontSize: 17 },
  cloudDesc: { ...type.caption, fontSize: 14, marginTop: 2 },
  disclaimer: { ...type.caption, textAlign: 'center', marginTop: space.xl },
});
