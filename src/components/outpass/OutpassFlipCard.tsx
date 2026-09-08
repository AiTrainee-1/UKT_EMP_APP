import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import QRCode from 'react-native-qrcode-svg';

import { Avatar } from '../ui/Avatar';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import type { OutpassRequestItem } from '../../hooks/useOutpass';
import type { Employee } from '../../hooks/useEmployee';

/**
 * A genuine two-sided ID card for an Outpass request. The front carries the
 * employee/trip details a gate guard needs; the back carries the
 * approval/rejection paper trail. Tapping the card flips it -a modern
 * flip-card gesture rather than two separate views, so the "back of the ID"
 * feels like part of the same physical object.
 *
 * Colour identity is dynamic: neutral while pending, green once approved,
 * red once rejected -recomputed from `request.status` on every render, never
 * fixed, so the same card component carries the request through its whole
 * lifecycle.
 */

const APPROVER_LABEL: Record<string, string> = { dept_head: 'HOD', hr: 'HR', system: 'On-Duty approval' };
const SOURCE_LABEL: Record<string, string> = { manual: 'Manual request', on_duty: 'Auto-generated from On-Duty' };

function useCountdown(expiresAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return { expired: false, remainingMs: null as number | null };
  const remainingMs = new Date(expiresAt).getTime() - now;
  return { expired: remainingMs <= 0, remainingMs };
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toneFor(status: string, Colors: Palette) {
  if (status === 'approved') {
    return { bg: Colors.badgeGreenBg, border: Colors.statusGreen, accent: Colors.statusGreen, chip: Colors.statusGreen };
  }
  if (status === 'rejected') {
    return { bg: Colors.badgeRedBg, border: Colors.statusRed, accent: Colors.statusRed, chip: Colors.statusRed };
  }
  return { bg: Colors.bgSurfaceMid, border: Colors.outline, accent: Colors.textMuted, chip: Colors.textMuted };
}

export function OutpassFlipCard({
  request,
  employee,
  startFlipped = false,
}: {
  request: OutpassRequestItem;
  employee?: Employee | null;
  startFlipped?: boolean;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { expired, remainingMs } = useCountdown(request.expiresAt);
  const tone = toneFor(request.status, Colors);
  // qrToken is only ever present while the pass is actually presentable at a
  // gate (see backend/api/outpass_request_views.py::_outpass_request_json) —
  // once exited/expired/never-approved it's simply omitted, so the QR block
  // only takes up card space when there's something real to scan.
  const showQr = !!request.qrToken;
  const cardHeight = showQr ? CARD_HEIGHT + 96 : CARD_HEIGHT;

  const flip = useSharedValue(startFlipped ? 180 : 0);
  const [flipped, setFlipped] = useState(startFlipped);

  const toggle = () => {
    const next = !flipped;
    setFlipped(next);
    flip.value = withTiming(next ? 180 : 0, { duration: 480 });
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1400 }, { rotateY: `${flip.value}deg` }],
    opacity: interpolate(flip.value, [89, 90], [1, 0], Extrapolation.CLAMP),
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1400 }, { rotateY: `${flip.value + 180}deg` }],
    opacity: interpolate(flip.value, [89, 90], [0, 1], Extrapolation.CLAMP),
  }));

  const statusLabel = request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Not Approved' : 'Pending Review';
  const statusIcon = request.status === 'approved' ? 'check-decagram' : request.status === 'rejected' ? 'close-octagon' : 'clock-outline';

  return (
    <Pressable onPress={toggle} style={styles.wrap} accessibilityRole="button" accessibilityLabel="Outpass card, tap to flip">
      <View style={[styles.flipBox, { height: cardHeight }]}>
        {/* ── Front: employee + trip details ── */}
        <Animated.View style={[styles.face, { backgroundColor: tone.bg, borderColor: tone.border }, frontStyle]}>
          <View style={styles.topRow}>
            <View style={styles.topLeft}>
              <MaterialCommunityIcons name={statusIcon as any} size={16} color={tone.accent} />
              <Text style={[styles.topLabel, { color: tone.accent }]}>{statusLabel}</Text>
            </View>
            {request.status === 'approved' && (
              <View style={[styles.timerPill, { backgroundColor: Colors.bgCard }]}>
                <MaterialCommunityIcons name="clock-outline" size={12} color={tone.accent} />
                <Text style={[styles.timerText, { color: tone.accent }]}>
                  {expired || remainingMs == null ? 'Expired' : formatRemaining(remainingMs)}
                </Text>
              </View>
            )}
            <MaterialCommunityIcons name="rotate-3d-variant" size={16} color={Colors.textMuted} style={styles.flipHint} />
          </View>

          <View style={styles.empRow}>
            <Avatar uri={employee?.photoUrl} name={employee?.name} size={52} borderColor={tone.border} />
            <View style={{ flex: 1 }}>
              <Text style={styles.empName} numberOfLines={1}>{employee?.name ?? '—'}</Text>
              <Text style={styles.empCode}>{employee?.employeeCode ?? ''}</Text>
            </View>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Going to</Text>
              <Text style={styles.gridValue} numberOfLines={1}>{request.destination}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Date</Text>
              <Text style={styles.gridValue}>{format(new Date(request.createdAt), 'dd MMM yyyy')}</Text>
            </View>
            <View style={[styles.gridItem, { width: '100%' }]}>
              <Text style={styles.gridLabel}>Reason</Text>
              <Text style={styles.gridValue} numberOfLines={2}>{request.reason}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Time</Text>
              <Text style={styles.gridValue}>{format(new Date(request.createdAt), 'h:mm a')}</Text>
            </View>
          </View>

          {showQr && (
            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                <QRCode value={request.qrToken!} size={72} color="#0f172a" backgroundColor="#fff" />
              </View>
              <Text style={[styles.qrCaption, { color: tone.accent }]}>SHOW THIS QR AT THE GATE</Text>
            </View>
          )}

          <Text style={styles.flipCue}>Tap to flip</Text>
        </Animated.View>

        {/* ── Back: approval trail ── */}
        <Animated.View style={[styles.face, styles.backFace, { backgroundColor: tone.bg, borderColor: tone.border }, backStyle]}>
          <View style={styles.backCenter}>
            <MaterialCommunityIcons name={statusIcon as any} size={34} color={tone.accent} />
            <Text style={[styles.backStatus, { color: tone.accent }]}>{statusLabel}</Text>
          </View>

          <View style={styles.backDetails}>
            {request.approvedBy && (
              <View style={styles.backRow}>
                <Text style={styles.backLabel}>{request.status === 'rejected' ? 'Rejected by' : 'Approved by'}</Text>
                <Text style={styles.backValue}>
                  {request.approvedBy}{request.approverRole ? ` (${APPROVER_LABEL[request.approverRole] ?? request.approverRole})` : ''}
                </Text>
              </View>
            )}
            {request.reviewComment && (
              <View style={styles.backRow}>
                <Text style={styles.backLabel}>Comment</Text>
                <Text style={styles.backValue}>{request.reviewComment}</Text>
              </View>
            )}
            <View style={styles.backRow}>
              <Text style={styles.backLabel}>Source</Text>
              <Text style={styles.backValue}>{SOURCE_LABEL[request.source] ?? request.source}</Text>
            </View>
            {request.exitedAt && (
              <View style={styles.backRow}>
                <Text style={styles.backLabel}>Gate Exit</Text>
                <Text style={styles.backValue}>
                  {request.exitGateName ? `Via ${request.exitGateName}, ` : ''}
                  {format(new Date(request.exitedAt), 'dd MMM, h:mm a')}
                </Text>
              </View>
            )}
            {request.status === 'pending' && (
              <Text style={styles.backPendingNote}>Waiting for HOD or HR to review this request.</Text>
            )}
          </View>

          <Text style={styles.flipCue}>Tap to flip back</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const CARD_HEIGHT = 240;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  wrap: { marginBottom: 14 },
  flipBox: { height: CARD_HEIGHT },
  face: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    padding: 16,
    backfaceVisibility: 'hidden',
  },
  backFace: { justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  topLabel: { fontSize: 12, fontWeight: '800' },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full, marginRight: 8,
  },
  timerText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  flipHint: { opacity: 0.6 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  empName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  empCode: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  gridItem: { width: '45%' },
  gridLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  gridValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 2 },
  flipCue: { position: 'absolute', bottom: 10, right: 16, color: Colors.textMuted, fontSize: 10, fontStyle: 'italic' },
  qrWrap: { alignItems: 'center', gap: 6, marginTop: 14 },
  qrBox: { padding: 6, borderRadius: BorderRadius.md, backgroundColor: '#fff' },
  qrCaption: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  backCenter: { alignItems: 'center', gap: 6, marginTop: 8 },
  backStatus: { fontSize: 18, fontWeight: '900' },
  backDetails: { gap: 10, marginTop: 10 },
  backRow: { gap: 2 },
  backLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  backValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  backPendingNote: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 4 },
});
