import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import QRCode from 'react-native-qrcode-svg';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { useTeaBreakQrToken, useTeaBreakStatus, type TeaBreakLogItem } from '../../hooks/useTeaBreak';

/**
 * Tea Break -a permanent per-employee QR (unlike the Outpass card's QR,
 * which is per-request and only shows up once approved/exited/etc). This
 * one never disappears: it always identifies the same employee, and the
 * server itself decides whether a scan means "going out" or "coming back"
 * based on whether an open break already exists -see
 * backend/api/tea_break_views.py::resolve_tea_break_scan. No approval, no
 * expiry to watch for here, unlike OutpassFlipCard.
 */

const REMARK_LABEL: Record<TeaBreakLogItem['remark'], string> = {
  overtime: 'Overtime', on_time: 'On Time', in_progress: 'Still Out', not_returned: 'Not Returned',
};

function toneFor(remark: TeaBreakLogItem['remark'], Colors: Palette) {
  if (remark === 'overtime' || remark === 'not_returned') {
    return { bg: Colors.badgeRedBg, text: Colors.badgeRedText };
  }
  if (remark === 'in_progress') {
    return { bg: Colors.badgeYellowBg, text: Colors.badgeYellowText };
  }
  return { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText };
}

function useElapsedMinutes(outAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!outAt) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [outAt]);
  if (!outAt) return null;
  return Math.max(0, Math.round((now - new Date(outAt).getTime()) / 60000));
}

export function TeaBreakPanel({ employeeId }: { employeeId: number | null }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data: qrToken, isLoading: qrLoading } = useTeaBreakQrToken(employeeId);
  const { data: status, isLoading: statusLoading } = useTeaBreakStatus(employeeId);
  const elapsedMinutes = useElapsedMinutes(status?.onBreak ? status.outAt : null);
  const overAllowed = elapsedMinutes != null && status ? elapsedMinutes > status.allowedMinutes : false;

  return (
    <View>
      <View style={[styles.card, { borderColor: Colors.outline }]}>
        <View style={styles.qrWrap}>
          {qrLoading || !qrToken ? (
            <View style={[styles.qrBox, { alignItems: 'center', justifyContent: 'center' }]}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.qrBox}>
              <QRCode value={qrToken} size={150} color="#0f172a" backgroundColor="#fff" />
            </View>
          )}
          <Text style={[styles.qrCaption, { color: Colors.textMuted }]}>
            SHOW THIS QR AT THE GATE -FOR TEA BREAK OUT &amp; IN
          </Text>
        </View>

        <View style={[styles.statusRow, { backgroundColor: status?.onBreak ? (overAllowed ? Colors.badgeRedBg : Colors.badgeYellowBg) : Colors.bgSurfaceMid }]}>
          <MaterialCommunityIcons
            name={status?.onBreak ? 'coffee-outline' : 'coffee-off-outline'}
            size={18}
            color={status?.onBreak ? (overAllowed ? Colors.badgeRedText : Colors.badgeYellowText) : Colors.textMuted}
          />
          <Text style={[styles.statusText, { color: status?.onBreak ? (overAllowed ? Colors.badgeRedText : Colors.badgeYellowText) : Colors.textMuted }]}>
            {statusLoading
              ? 'Checking status…'
              : status?.onBreak
              ? `On tea break -${elapsedMinutes ?? 0} min${overAllowed ? ' (over allowed time)' : ''}`
              : 'Not currently on a tea break'}
          </Text>
        </View>
      </View>

      {!!status?.recent.length && (
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: Colors.textMuted }]}>Recent Tea Breaks</Text>
          {status.recent.map((log) => {
            const tone = toneFor(log.remark, Colors);
            return (
              <View key={log.id} style={[styles.recentRow, { backgroundColor: Colors.bgCard }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recentTime, { color: Colors.textPrimary }]}>
                    {format(new Date(log.outAt), 'dd MMM, h:mm a')}
                    {log.inAt ? ` – ${format(new Date(log.inAt), 'h:mm a')}` : ''}
                  </Text>
                  <Text style={[styles.recentSub, { color: Colors.textMuted }]}>{log.takenMinutes} min</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.text }]}>{REMARK_LABEL[log.remark]}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1.5,
    padding: 16, alignItems: 'center', gap: 14,
  },
  qrWrap: { alignItems: 'center', gap: 8 },
  qrBox: { padding: 12, borderRadius: BorderRadius.md, backgroundColor: '#fff', width: 174, height: 174 },
  qrCaption: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch',
    borderRadius: BorderRadius.md, paddingVertical: 10, paddingHorizontal: 14,
  },
  statusText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  recentSection: { marginTop: 18, gap: 8 },
  recentTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BorderRadius.md, padding: 12,
  },
  recentTime: { fontSize: 13, fontWeight: '600' },
  recentSub: { fontSize: 11, marginTop: 2 },
  badge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
