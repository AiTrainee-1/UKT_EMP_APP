import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePendingRequests } from '../../hooks/usePendingReminders';
import { useAdvanceEligibility } from '../../hooks/useAdvances';
import { useGeoPunchStatus } from '../../hooks/useGeoAttendance';
import { useCLEligibility } from '../../hooks/useCasualLeave';
import { useHomeOutpass } from '../../hooks/useHomeOutpass';
import type { OutpassRequestItem } from '../../hooks/useOutpass';
import { pickOpenPass } from '../../lib/outpassOpen';
import { isStaffEmployee } from '../../lib/employmentType';
import { useAppActive } from '../../lib/motionPrefs';
import {
  CL_REMIND_DAYS,
  advanceAttention,
  casualLeaveAttention,
  daysLeftInMonth,
  onDutyAttention,
  outpassAttention,
  pendingRequestsAttention,
  sortAttention,
  type AttentionItem,
  type AttentionTone,
} from '../../lib/homeAttention';
import { Reveal } from '../Reveal';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';

/**
 * "Needs your attention" on Home: the few things that are waiting on the employee or running right now, each one tap away
 * from its screen. Rows (most urgent first): a gate pass that is out / ready (live timer), an On-Duty session in progress,
 * requests waiting for an answer, advance & loan applications open, this month's Casual Leave unused (staff, last week).
 *
 * Quiet by design: nothing renders until every source has answered once (so the section appears in one go instead of
 * row by row), a failed source gives no row and no error, and with nothing to show the whole section is absent.
 */
export function AttentionStrip({
  employeeId,
  employmentType,
  now,
}: {
  employeeId: number | null;
  employmentType: unknown;
  /** Home's calendar "now" (changes on a new day): decides the Casual Leave reminder. */
  now: Date;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const pending = usePendingRequests();
  const advances = useAdvanceEligibility();
  const geo = useGeoPunchStatus(!!employeeId);
  const outpass = useHomeOutpass(employeeId);
  // Casual Leave is staff-only and only worth a reminder in the month's last week; otherwise the query stays off.
  const clOn = isStaffEmployee(employmentType) && daysLeftInMonth(now) < CL_REMIND_DAYS;
  const cl = useCLEligibility(clOn ? employeeId : null);

  // Coming back to Home (after sending a request, applying for an advance, ...) re-asks whatever is older than 30 s.
  const latest = useRef({ pending, advances, outpass });
  latest.current = { pending, advances, outpass };
  useFocusEffect(
    useCallback(() => {
      for (const q of Object.values(latest.current)) {
        // isEnabled: refetch() would otherwise run even a switched-off query (no employee yet).
        if (q.isEnabled && q.isStale && !q.isFetching) void q.refetch({ cancelRefetch: false });
      }
    }, []),
  );

  // The gate-pass row tells the strip when its pass closed (exit window over), so the strip can drop it.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const settled = !pending.isLoading && !advances.isLoading && !geo.isLoading && !outpass.isLoading && !cl.isLoading;
  if (!settled) return null;

  const nowMs = Date.now();
  const openPass = pickOpenPass(outpass.data ?? [], nowMs);
  const rows = sortAttention([
    onDutyAttention(geo.data?.onDutySession),
    pendingRequestsAttention(pending.data, nowMs),
    advanceAttention(advances.data),
    clOn ? casualLeaveAttention(cl.data?.months, now) : null,
  ]);
  const count = rows.length + (openPass ? 1 : 0);
  if (count === 0) return null;

  return (
    <Reveal offsetY={8} style={styles.card}>
      <View style={styles.header} accessibilityRole="header">
        <MaterialCommunityIcons name="bell-ring-outline" size={16} color={Colors.primary} />
        <Text style={styles.headerText}>Needs your attention</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>
      {openPass && <OutpassRow pass={openPass} first onGone={bump} />}
      {rows.map((row, i) => (
        <AttentionRow key={row.key} item={row} first={!openPass && i === 0} />
      ))}
    </Reveal>
  );
}

/** The gate-pass row: re-worded every second while the app is on screen (its timer), quiet in the background. */
function OutpassRow({ pass, first, onGone }: { pass: OutpassRequestItem; first: boolean; onGone: () => void }) {
  const active = useAppActive();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const item = outpassAttention(pass, nowMs);
  const gone = item == null;
  useEffect(() => {
    if (gone) onGone();
  }, [gone, onGone]);
  if (!item) return null;
  return <AttentionRow item={item} first={first} />;
}

const HINTS: Record<string, string> = {
  '/outpass': 'Opens Gate Outpass',
  '/on-duty': 'Opens On-Duty',
  '/hod-assignment?tab=requests': 'Opens My Requests',
  '/settlement': 'Opens Advances and Loans',
  '/casual-leave': 'Opens Casual Leave',
};

function AttentionRow({ item, first }: { item: AttentionItem; first: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneColors(Colors, item.tone);
  return (
    <TouchableOpacity
      style={[styles.row, !first && styles.rowDivider]}
      onPress={() => router.push(item.href as any)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={item.a11y}
      accessibilityHint={HINTS[item.href]}
    >
      <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
        <MaterialCommunityIcons name={item.icon as any} size={18} color={tone.fg} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, item.tone === 'urgent' && { color: tone.fg }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {item.detail}
        </Text>
        {item.progress != null && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(item.progress * 100)}%`, backgroundColor: tone.fg }]} />
          </View>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

function toneColors(Colors: Palette, tone: AttentionTone): { bg: string; fg: string } {
  switch (tone) {
    case 'urgent':
      return { bg: Colors.badgeRedBg, fg: Colors.statusRed };
    case 'active':
      return { bg: Colors.badgeBlueBg, fg: Colors.statusBlue };
    case 'waiting':
      return { bg: Colors.badgeYellowBg, fg: Colors.badgeYellowText };
    case 'money':
      return { bg: Colors.badgeGreenBg, fg: Colors.statusGreen };
    case 'leave':
    default:
      return { bg: Colors.badgeLeaveBg, fg: Colors.statusLeave };
  }
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 4,
      marginBottom: 20,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    headerText: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    countPill: {
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primaryFixed,
      alignItems: 'center',
    },
    countText: { color: Colors.primary, fontSize: 11, fontWeight: '800', ...TabularNums },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
    iconWrap: { width: 36, height: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: 2 },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    detail: { color: Colors.textMuted, fontSize: 12, ...TabularNums },
    track: { height: 4, borderRadius: 2, backgroundColor: Colors.bgSurfaceLow, marginTop: 5, overflow: 'hidden' },
    fill: { height: 4, borderRadius: 2 },
  });
