// app/profile-edit.js
// 新增或編輯受測者（網址帶 id 就是編輯）。
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Button, Card, Chip } from '../components/ui';
import { colors, radius, space, type } from '../constants/theme';
import { EDUCATION, SEX, validateProfile } from '../utils/profileStore';
import { profileStore, useProfiles } from '../utils/profiles';
import { confirmDialog } from '../utils/dialog';

export default function ProfileEditScreen() {
  const { id } = useLocalSearchParams();
  const state = useProfiles();
  if (!state.loaded) return null; // 等手機裡的資料讀完，表單才帶得出原本的內容
  const existing = state.profiles.find(p => p.id === id) || null;
  return <ProfileForm key={existing?.id ?? 'new'} existing={existing} state={state} />;
}

function ProfileForm({ existing, state }) {

  const [name, setName] = useState(existing?.name ?? '');
  const [birthYear, setBirthYear] = useState(existing?.birthYear ? String(existing.birthYear) : '');
  const [education, setEducation] = useState(existing?.education ?? null);
  const [sex, setSex] = useState(existing?.sex ?? null);
  const [errors, setErrors] = useState([]);

  const save = () => {
    const input = { name, birthYear, education, sex };
    const problems = validateProfile(input);
    setErrors(problems);
    if (problems.length) return;
    if (existing) profileStore.updateProfile(existing.id, input);
    else profileStore.addProfile(input); // 新增的受測者自動成為目前受測者
    // 從首頁直接新增：回首頁；從清單新增：也回首頁，比較直覺
    if (existing) router.back();
    else router.dismissTo('/');
  };

  const remove = () => {
    if (!existing) return;
    const target = existing;
    const count = state.results.filter(r => r.profileId === target.id).length;
    confirmDialog(
      `刪除「${target.name}」？`,
      count ? `他的 ${count} 筆測驗紀錄也會一起刪除，無法復原。` : '刪除後無法復原。',
      { okText: '刪除', destructive: true },
    ).then(ok => {
      if (!ok) return;
      profileStore.deleteProfile(target.id);
      router.back();
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: existing ? '編輯受測者' : '新增受測者' }} />

        <Card>
          <Text style={styles.label}>姓名或暱稱 <Text style={styles.required}>必填</Text></Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="例如：王阿嬤"
            placeholderTextColor={colors.inkFaint}
            style={styles.input}
            maxLength={20}
            returnKeyType="next"
          />

          <Text style={styles.label}>出生年（西元）</Text>
          <TextInput
            value={birthYear}
            onChangeText={t => setBirthYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="例如：1948"
            placeholderTextColor={colors.inkFaint}
            keyboardType="number-pad"
            style={styles.input}
          />

          <Text style={styles.label}>教育程度</Text>
          <View style={styles.chips}>
            {EDUCATION.map(e => (
              <Chip key={e.key} label={e.label} selected={education === e.key} onPress={() => setEducation(education === e.key ? null : e.key)} />
            ))}
          </View>
          <Text style={styles.hint}>MoCA 量表規定教育 6 年以下（國小以下）總分加 1 分，記下來方便日後判讀。</Text>

          <Text style={styles.label}>性別</Text>
          <View style={styles.chips}>
            {SEX.map(s => (
              <Chip key={s.key} label={s.label} selected={sex === s.key} onPress={() => setSex(sex === s.key ? null : s.key)} />
            ))}
          </View>
        </Card>

        {errors.length > 0 && (
          <View style={{ marginTop: space.lg }}>
            <Banner kind="bad">{errors.join('\n')}</Banner>
          </View>
        )}

        <Button title={existing ? '儲存' : '新增並開始使用'} icon="checkmark" onPress={save} style={{ marginTop: space.xl }} />
        {existing && <Button title="刪除這位受測者" variant="danger" icon="trash-outline" onPress={remove} style={{ marginTop: space.md }} />}

        <Text style={styles.privacy}>{Platform.OS === 'web' ? '這些資料只存在這個瀏覽器裡，不會上傳。' : '這些資料只存在這支手機裡，不會上傳。'}除了姓名，其他欄位都可以不填。</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl - 4, paddingBottom: 48 },
  label: { ...type.subtitle, fontSize: 17, marginTop: space.lg, marginBottom: space.sm },
  required: { fontSize: 13, color: colors.bad, fontWeight: '700' },
  input: {
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
    fontSize: 20, paddingVertical: 12, paddingHorizontal: 14, color: colors.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { ...type.caption, marginTop: space.sm },
  privacy: { ...type.caption, textAlign: 'center', marginTop: space.xl },
});
