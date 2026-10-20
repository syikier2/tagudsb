// components/TrendBars.js
// 簡單的長條趨勢圖（不需要額外的圖表套件）：由舊到新，由左到右。
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';

/**
 * @param items [{ key, value, label, valueText, color? }]（舊的在前）
 * @param max 長條的最大值（例如分數滿分 5）
 */
export function TrendBars({ items, max, color = colors.primary, height = 150, unit = '' }) {
  if (!items.length) return null;
  const top = max ?? Math.max(...items.map(i => i.value ?? 0), 1);
  return (
    <View>
      <View style={[styles.plot, { height }]}>
        {/* 底線與一半的參考線 */}
        <View style={[styles.grid, { bottom: height / 2 }]} />
        {items.map(i => {
          const h = i.value == null ? 0 : Math.max(4, (i.value / top) * (height - 26));
          return (
            <View key={i.key} style={styles.col}>
              <Text style={styles.valueText} numberOfLines={1}>{i.valueText ?? (i.value == null ? '—' : `${i.value}${unit}`)}</Text>
              <View style={[styles.bar, { height: h, backgroundColor: i.color ?? color }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {items.map(i => (
          <Text key={i.key} style={styles.label} numberOfLines={1}>{i.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, borderBottomWidth: 1.5, borderBottomColor: colors.line },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line, opacity: 0.6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', maxWidth: 34, borderTopLeftRadius: radius.sm / 2, borderTopRightRadius: radius.sm / 2 },
  valueText: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 3 },
  labels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  label: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.inkFaint },
});
