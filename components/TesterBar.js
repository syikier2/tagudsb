// components/TesterBar.js
// 測驗頁面上方的「受測者」標示，以及結果下方的「已儲存 / 未儲存」提示。
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '../constants/theme';
import { useActiveProfile, useProfiles } from '../utils/profiles';
import { Avatar, Banner } from './ui';

/** 測驗頁上方：目前是誰在測（點一下可以換人） */
export function TesterBar() {
  const active = useActiveProfile();
  return (
    <Pressable onPress={() => router.push('/profiles')} style={styles.bar} accessibilityLabel="切換受測者">
      {active ? (
        <>
          <Avatar name={active.name} seed={active.id} size={28} />
          <Text style={styles.text} numberOfLines={1}>受測者：{active.name}</Text>
        </>
      ) : (
        <>
          <Ionicons name="person-outline" size={20} color={colors.warn} />
          <Text style={[styles.text, { color: colors.warn }]}>未選擇受測者（結果不會儲存）</Text>
        </>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
    </Pressable>
  );
}

/** 結果下方：這次結果有沒有存起來 */
export function SavedNotice({ saved }) {
  const state = useProfiles();
  if (saved === undefined) return null;
  const owner = saved && state.profiles.find(p => p.id === saved.profileId);
  return (
    <View style={styles.notice}>
      {saved ? (
        <Banner kind="good" action="查看紀錄" onAction={() => router.push('/history')}>
          已存到「{owner?.name ?? '受測者'}」的歷史紀錄
        </Banner>
      ) : (
        <Banner
          kind="warn"
          action={state.profiles.length ? '選擇' : '新增'}
          onAction={() => router.push(state.profiles.length ? '/profiles' : '/profile-edit')}
        >
          沒有選擇受測者，這次結果沒有儲存
        </Banner>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'center',
    backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line,
    paddingVertical: 6, paddingLeft: 6, paddingRight: 12, marginBottom: space.md, maxWidth: '100%',
  },
  text: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  notice: { width: '100%', marginTop: space.lg },
});
