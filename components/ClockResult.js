// components/ClockResult.js
// 顯示評分結果：分數、1~12 每個數字的狀態、說明、免責聲明，以及可展開的偵錯資訊。
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, shadow } from '../constants/theme';
import { DISCLAIMER } from '../utils/clockScoring';

const STATUS_STYLE = {
  correct: { bg: colors.goodSoft, border: colors.good, text: colors.good },
  misplaced: { bg: colors.warnSoft, border: '#D99A3D', text: colors.warn },
  missing: { bg: colors.neutralSoft, border: colors.line, text: colors.inkFaint },
};

export function ClockResult({ result, accent = '#4A90E2', title = '評估結果' }) {
  if (!result) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      <View style={[styles.scoreBox, { borderColor: accent }]}>
        <Text style={[styles.scoreValue, { color: accent }]}>
          {result.score} <Text style={styles.scoreMax}>/ {result.maxScore}</Text>
        </Text>
        <Text style={styles.scoreSub}>
          辨識到 {result.foundCount} / 12 個數字，其中 {result.correctCount} 個位置正確
        </Text>
      </View>

      <View style={styles.grid}>
        {result.numbers.map(({ n, status }) => {
          const s = STATUS_STYLE[status];
          return (
            <View key={n} style={[styles.chip, { backgroundColor: s.bg, borderColor: s.border }]}>
              <Text style={[styles.chipText, { color: s.text }]}>{n}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Legend color={STATUS_STYLE.correct.border} label="位置正確" />
        <Legend color={STATUS_STYLE.misplaced.border} label="位置偏移" />
        <Legend color={STATUS_STYLE.missing.border} label="未辨識到" />
      </View>

      <Text style={styles.summary}>{result.summary}</Text>
      {result.details.map(d => (
        <Text key={d} style={styles.detail}>・{d}</Text>
      ))}

      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
    </View>
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

function CheckRow({ ok, label }) {
  return (
    <View style={styles.checkRow}>
      <Text style={[styles.checkIcon, { color: ok ? colors.good : colors.bad }]}>{ok ? '✓' : '✗'}</Text>
      <Text style={styles.checkLabel}>{label}</Text>
    </View>
  );
}

/**
 * 指針評估＋MoCA 畫鐘題參考
 * @param hands handsScoring.scoreHands 的結果
 * @param numbersPass 12 個數字是否都在、且位置大致正確
 * @param timeText 例如「11 點 10 分」
 */
export function HandsResult({ hands, numbersPass, timeText, contour = null }) {
  if (!hands) return null;
  // contour：拍照模式才有（自己畫的圓圈）；手繪模式由 App 提供圓圈，不評分輪廓
  const total = contour ? 3 : 2;
  const passed = (numbersPass ? 1 : 0) + (hands.pass ? 1 : 0) + (contour?.pass ? 1 : 0);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>指針評估（{timeText}）</Text>
      <CheckRow ok={hands.checks.count} label="畫了兩根指針" />
      <CheckRow ok={hands.checks.direction} label={`指出 ${timeText}`} />
      <CheckRow ok={hands.checks.length} label="時針比分針短" />
      <CheckRow ok={hands.checks.centered} label="指針從中心出發" />
      {hands.messages.map(m => (
        <Text key={m} style={styles.detail}>・{m}</Text>
      ))}

      <View style={styles.mocaBox}>
        <Text style={styles.mocaTitle}>參考 MoCA 畫鐘題：{total} 項通過 {passed} 項</Text>
        {contour && <CheckRow ok={contour.pass} label="輪廓：完整的圓形，只有輕微變形" />}
        <CheckRow ok={numbersPass} label="數字：1～12 都有，位置大致正確" />
        <CheckRow ok={hands.pass} label="指針：兩根指針正確指出時間，時針較短" />
        {contour ? (
          contour.messages.map(m => <Text key={m} style={styles.mocaNote}>・{m}</Text>)
        ) : (
          <Text style={styles.mocaNote}>MoCA 另有「輪廓」1 分；本 App 已提供圓圈，所以不評分這一項。</Text>
        )}
      </View>
    </View>
  );
}

/** 作畫過程（僅供觀察，不計分） */
export function DrawingProcess({ stats }) {
  if (!stats) return null;
  const rows = [
    ['作畫時間', `${stats.durationSec.toFixed(0)} 秒`],
    ['筆畫數', `${stats.strokeCount} 筆`],
    ['最長停頓', `${stats.longestPauseSec.toFixed(1)} 秒`],
    ['清除重畫', `${stats.clears} 次`],
    ['復原上一筆', `${stats.undos} 次`],
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.title}>作畫過程</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.statRow}>
          <Text style={styles.statKey}>{k}</Text>
          <Text style={styles.statValue}>{v}</Text>
        </View>
      ))}
      <Text style={styles.disclaimer}>僅供觀察，不計入分數。作畫時間偏長、停頓多或反覆修改，可作為輔助參考。</Text>
    </View>
  );
}

const CLOUD_OUTCOME = {
  agree: '雲端也認為是',
  changed: '雲端認為是',
  ignored: '雲端讀成',
  noAnswer: '雲端沒讀到',
};

/** 偵錯資訊裡「每一組辨識結果」的文字 */
export function readingText(id, rec) {
  const chars = rec.chars
    .map(ch => {
      if (ch.cloud) {
        const c = ch.cloud;
        if (c.outcome === 'agree') return `${ch.digit}☁✓（${CLOUD_OUTCOME.agree} ${c.digit}）`;
        if (c.outcome === 'changed') return `${ch.digit}☁（手機端原本認為 ${ch.second}，${CLOUD_OUTCOME.changed} ${c.digit}，改用雲端）`;
        if (c.outcome === 'ignored') return `${ch.digit}?（${CLOUD_OUTCOME.ignored}「${c.text.trim() || c.digit}」，不在前兩名，不採用）`;
        return `${ch.digit}?（也像 ${ch.second}；${CLOUD_OUTCOME.noAnswer}）`;
      }
      return ch.byLoop
        ? `${ch.digit}（依有沒有圈圈判斷，不是 ${ch.second}）`
        : ch.confident
          ? `${ch.digit}✓`
          : `${ch.digit}?（也像 ${ch.second}）`;
    })
    .join(' ');
  return `第 ${id} 組 → ${rec.digits}　${chars}`;
}

/** 錯誤訊息（網路、金鑰等系統問題），與「分數低」分開顯示，避免使用者誤會 */
export function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorTitle}>⚠️ 無法完成分析</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/**
 * 可展開的偵錯資訊
 * - 拍照模式：ocrText（AI 讀到的文字）
 * - 手繪模式：sheet（送去辨識的字卡格子圖）、readings（每組讀到什麼）、ignored（排除的筆畫）
 * - 兩者都有：rawJson（Vision API 原始回應）
 */
export function DebugPanel({ ocrText, rawJson, sheet, readings, ignored, preview }) {
  const [open, setOpen] = useState(false);
  if (ocrText == null && !rawJson && !sheet && !preview) return null;
  const ignoredText = ignored
    ? [ignored.circle && `圓圈 ${ignored.circle} 筆`, ignored.hands && `指針 ${ignored.hands} 筆`, ignored.noise && `雜點 ${ignored.noise} 個`]
        .filter(Boolean)
        .join('、')
    : '';
  return (
    <View style={styles.debugWrap}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={styles.debugToggle}>
        <Text style={styles.debugToggleText}>{open ? '▼' : '▶'} 偵錯資訊（AI 看到的內容）</Text>
      </TouchableOpacity>
      {open && (
        <>
          {preview && (
            <View style={styles.ocrBox}>
              <Text style={styles.ocrTitle}>🖼️ 照片轉成的黑白圖（灰色 = 偵測到的圓圈）</Text>
              <Image
                source={{ uri: `data:image/bmp;base64,${preview.base64}` }}
                style={[styles.sheetImage, { aspectRatio: preview.width / preview.height }]}
                resizeMode="contain"
              />
            </View>
          )}
          {sheet && (
            <View style={styles.ocrBox}>
              <Text style={styles.ocrTitle}>🧩 筆畫分組結果</Text>
              <Image
                source={{ uri: `data:image/bmp;base64,${sheet.base64}` }}
                style={[styles.sheetImage, { aspectRatio: sheet.width / sheet.height }]}
                resizeMode="contain"
              />
              {ignoredText ? <Text style={styles.ocrText}>已排除：{ignoredText}</Text> : null}
            </View>
          )}
          {readings && (
            <View style={styles.ocrBox}>
              <Text style={styles.ocrTitle}>🔍 每一組的辨識結果（✓ 確定、? 不太確定、☁ 有問雲端）</Text>
              {readings.map(r => (
                <Text key={r.id} style={styles.ocrText}>{r.text}</Text>
              ))}
            </View>
          )}
          {ocrText != null && (
            <View style={styles.ocrBox}>
              <Text style={styles.ocrTitle}>🔍 辨識到的文字</Text>
              <Text style={styles.ocrText}>{ocrText || '（沒有辨識到任何文字）'}</Text>
            </View>
          )}
          {rawJson && (
            <View style={styles.jsonBox}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
                <Text style={styles.jsonText}>{JSON.stringify(rawJson, null, 2)}</Text>
              </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: colors.surface, padding: 20, borderRadius: radius.lg, marginTop: 16, ...shadow },
  title: { fontSize: 21, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  scoreBox: { borderWidth: 2, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  scoreValue: { fontSize: 40, fontWeight: '900' },
  scoreMax: { fontSize: 22, color: colors.inkFaint, fontWeight: '700' },
  scoreSub: { fontSize: 15, color: colors.inkSoft, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  chip: { width: '15%', aspectRatio: 1, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 18, fontWeight: 'bold' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, color: colors.inkSoft },
  summary: { fontSize: 17, color: colors.ink, lineHeight: 26, fontWeight: '600' },
  detail: { fontSize: 15, color: colors.inkSoft, lineHeight: 24, marginTop: 2 },
  disclaimer: { fontSize: 12, color: colors.inkFaint, marginTop: 14, lineHeight: 18 },

  checkRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  checkIcon: { fontSize: 18, fontWeight: '900', width: 26 },
  checkLabel: { fontSize: 16, color: colors.ink, flex: 1 },
  mocaBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 14, marginTop: 14, borderWidth: 1, borderColor: colors.line },
  mocaTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  mocaNote: { fontSize: 12, color: colors.inkFaint, marginTop: 6, lineHeight: 18 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  statKey: { fontSize: 16, color: colors.inkSoft },
  statValue: { fontSize: 16, color: colors.ink, fontWeight: '700' },

  errorBox: { width: '100%', backgroundColor: '#FDEDEC', borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#F5B7B1' },
  errorTitle: { fontSize: 16, fontWeight: 'bold', color: '#C0392B', marginBottom: 4 },
  errorText: { fontSize: 15, color: '#922B21', lineHeight: 22 },

  debugWrap: { width: '100%', marginTop: 16 },
  debugToggle: { paddingVertical: 8 },
  debugToggleText: { fontSize: 14, fontWeight: 'bold', color: colors.inkFaint },
  ocrBox: { backgroundColor: '#FFF9E6', padding: 12, borderRadius: 8, marginBottom: 8 },
  ocrTitle: { fontSize: 14, fontWeight: 'bold', color: '#F57C00', marginBottom: 4 },
  ocrText: { fontSize: 14, color: '#5D4037', fontFamily: 'monospace' },
  sheetImage: { width: '100%', backgroundColor: 'white', borderRadius: 6, marginVertical: 6 },
  jsonBox: { backgroundColor: '#1C1C1E', padding: 12, borderRadius: 12 },
  jsonText: { fontFamily: 'monospace', fontSize: 11, color: '#30D158' },
});
