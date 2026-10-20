// components/ui.js
// 共用的介面元件：卡片、按鈕、選項膠囊、頭像、提示條。樣式統一來自 constants/theme.js。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, space, type } from '../constants/theme';

export function Card({ children, style, onPress, accessibilityLabel }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * @param variant 'primary' | 'secondary' | 'ghost' | 'danger'
 */
export function Button({ title, onPress, icon, variant = 'primary', color, disabled, style, compact }) {
  const v = VARIANTS[variant];
  const bg = variant === 'primary' && color ? color : v.bg;
  const fg = variant !== 'primary' && color ? color : v.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, borderColor: v.border ?? bg },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={compact ? 18 : 22} color={fg} />}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: colors.primary, fg: '#FFFFFF' },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, fg: colors.bad, border: colors.badSoft },
};

/** 可選擇的膠囊（教育程度、性別、分頁） */
export function Chip({ label, selected, onPress, color = colors.primary }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color, borderColor: color },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const AVATAR_COLORS = ['#2D6A7A', '#B5622B', '#4F5FA8', '#6B5B8C', '#2E7D4F', '#8C5A3C'];

/** 圓形頭像：顯示名字的第一個字 */
export function Avatar({ name, size = 52, seed }) {
  const key = String(seed ?? name ?? '');
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{(name || '?').trim().slice(0, 1)}</Text>
    </View>
  );
}

/** 提示條：kind = info | good | warn | bad */
export function Banner({ kind = 'info', icon, children, action, onAction }) {
  const k = BANNER[kind];
  return (
    <View style={[styles.banner, { backgroundColor: k.bg }]}>
      <Ionicons name={icon || k.icon} size={22} color={k.fg} />
      <Text style={[styles.bannerText, { color: k.fg }]}>{children}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={[styles.bannerAction, { color: k.fg }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const BANNER = {
  info: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'information-circle' },
  good: { bg: colors.goodSoft, fg: colors.good, icon: 'checkmark-circle' },
  warn: { bg: colors.warnSoft, fg: colors.warn, icon: 'alert-circle' },
  bad: { bg: colors.badSoft, fg: colors.bad, icon: 'close-circle' },
};

export function SectionTitle({ children, right }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

/** 一行「左邊標籤、右邊數值」 */
export function KeyValue({ label, value, last }) {
  return (
    <View style={[styles.kv, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg + 2, ...shadow },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    minHeight: 56, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1.5,
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: space.md },
  buttonText: { fontSize: 19, fontWeight: '700' },
  buttonTextCompact: { fontSize: 16 },

  chip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface,
  },
  chipText: { fontSize: 17, color: colors.ink, fontWeight: '600' },
  chipTextOn: { color: '#FFFFFF' },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  bannerText: { flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  bannerAction: { fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md },
  sectionTitle: { ...type.subtitle, color: colors.inkSoft, fontSize: 17 },

  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  kvLabel: { fontSize: 16, color: colors.inkSoft },
  kvValue: { fontSize: 16, color: colors.ink, fontWeight: '700' },
});
