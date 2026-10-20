// app/profiles.js
// 受測者清單：點一下選擇，鉛筆圖示編輯，最下面新增。
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card } from '../components/ui';
import { colors, space, type } from '../constants/theme';
import { profileSubtitle } from '../utils/profileStore';
import { profileStore, useProfiles } from '../utils/profiles';
import { shortDateTime } from '../utils/resultSummary';

export default function ProfilesScreen() {
  const state = useProfiles();

  const choose = id => {
    profileStore.setActive(id);
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '選擇受測者' }} />

      {state.profiles.length === 0 && (
        <Text style={styles.empty}>還沒有受測者。新增一位，測驗結果就會存在他的紀錄裡。</Text>
      )}

      <View style={{ gap: space.md }}>
        {state.profiles.map(p => {
          const records = state.results.filter(r => r.profileId === p.id);
          const latest = records.reduce((a, r) => (!a || r.at > a.at ? r : a), null);
          const selected = p.id === state.activeId;
          return (
            <Card
              key={p.id}
              onPress={() => choose(p.id)}
              style={[styles.row, selected && styles.rowSelected]}
              accessibilityLabel={`選擇 ${p.name}`}
            >
              <Avatar name={p.name} seed={p.id} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </View>
                {!!profileSubtitle(p) && <Text style={styles.sub}>{profileSubtitle(p)}</Text>}
                <Text style={styles.meta}>
                  {records.length ? `${records.length} 筆紀錄・最近 ${shortDateTime(latest.at)}` : '尚無紀錄'}
                </Text>
              </View>
              <Pressable
                hitSlop={12}
                onPress={() => router.push({ pathname: '/profile-edit', params: { id: p.id } })}
                accessibilityLabel={`編輯 ${p.name}`}
                style={styles.edit}
              >
                <Ionicons name="create-outline" size={24} color={colors.inkSoft} />
              </Pressable>
            </Card>
          );
        })}
      </View>

      <Button
        title="新增受測者"
        icon="person-add-outline"
        onPress={() => router.push('/profile-edit')}
        style={{ marginTop: space.xl }}
      />
      {state.activeId && (
        <Button
          title="不選擇（這次測驗不儲存）"
          variant="ghost"
          onPress={() => choose(null)}
          style={{ marginTop: space.sm }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },
  empty: { ...type.body, color: colors.inkSoft, textAlign: 'center', marginVertical: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderWidth: 2, borderColor: 'transparent' },
  rowSelected: { borderColor: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontSize: 21, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  sub: { ...type.small, marginTop: 2 },
  meta: { ...type.caption, marginTop: 2 },
  edit: { padding: space.sm },
});
