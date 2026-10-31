import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Svg, { Circle } from 'react-native-svg';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, ClayElevation } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { dayMonth, statusGroup, statusText, windowHeadline, type WindowInfo } from '../../lib/settlement';

/** The phone's "Reduce motion" setting (the same rule src/components/Reveal.tsx follows). */
export function useReduceMotionPref(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduce(v); })
      .catch(() => { /* older platforms: assume motion is fine */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

// ─── Window banner: a strip of the month with the 20th-to-month-end part lit ────────────────────────────────

export function WindowBanner({ window, today }: { window: WindowInfo; today: string }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotionPref();

  const lastDay = Number(/-(\d{2})$/.exec(window.closesOn)?.[1] ?? 30);
  const day = Number(/-(\d{2})$/.exec(today)?.[1] ?? 1);
  const openStart = (19 / Math.max(1, lastDay - 1)) * 100;
  const todayPos = ((day - 1) / Math.max(1, lastDay - 1)) * 100;
  const tone = window.isOpen ? Colors.statusGreen : Colors.statusYellow;
  const big = window.isOpen ? window.daysLeft : window.daysUntilOpen;

  return (
    <View
      style={[styles.banner, { borderColor: window.isOpen ? Colors.badgeGreenBg : Colors.badgeYellowBg }]}
      accessibilityRole="summary"
      accessibilityLabel={`${windowHeadline(window)}. ${window.message}`}
    >
      <View style={styles.bannerTop}>
        <View style={[styles.bannerIcon, { backgroundColor: window.isOpen ? Colors.badgeGreenBg : Colors.badgeYellowBg }]}>
          <MaterialCommunityIcons
            name={window.isOpen ? 'calendar-check' : 'calendar-clock'}
            size={22}
            color={window.isOpen ? Colors.badgeGreenText : Colors.badgeYellowText}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>{windowHeadline(window)}</Text>
          <Text style={styles.bannerText}>{window.message}</Text>
        </View>
        <View style={styles.countBox}>
          <Text style={[styles.countNum, TabularNums, { color: tone }]}>{big}</Text>
          <Text style={styles.countLabel}>{window.isOpen ? (big === 1 ? 'day left' : 'days left') : big === 1 ? 'day to go' : 'days to go'}</Text>
        </View>
      </View>

      <View style={styles.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.track}>
          <View style={[styles.openPart, { left: `${openStart}%`, backgroundColor: Colors.statusGreen }]} />
          <MotiView
            from={reduce ? undefined : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: reduce ? 0 : 420, delay: reduce ? 0 : 200 }}
            style={[styles.todayDot, { left: `${todayPos}%`, borderColor: tone }]}
          />
        </View>
        <View style={styles.stripLabels}>
          <Text style={styles.stripLabel}>1</Text>
          <Text style={[styles.stripLabel, { position: 'absolute', left: `${openStart}%`, marginLeft: -8 }]}>
            {dayMonth(window.opensOn)}
          </Text>
          <Text style={styles.stripLabel}>{lastDay}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Ring meter ───────────────────────────────────────────────────────────────────────────────────────────────

export function RingMeter({
  ratio,
  color,
  size = 96,
  stroke = 10,
  children,
}: {
  ratio: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const { C: Colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio || 0));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Colors.bgSurfaceHigh} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── A filled bar that grows to its value ─────────────────────────────────────────────────────────────────────

export function Bar({ ratio, color, height = 8, style }: { ratio: number; color: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const { C: Colors } = useTheme();
  const reduce = useReduceMotionPref();
  const share = Math.max(0, Math.min(1, ratio || 0));
  // Animate a measured width in points (percentage strings are not animated reliably).
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height, borderRadius: height / 2, backgroundColor: Colors.bgSurfaceHigh, overflow: 'hidden' }, style]}
    >
      <MotiView
        from={{ width: reduce ? width * share : 0 }}
        animate={{ width: width * share }}
        transition={{ type: 'timing', duration: reduce ? 0 : 380 }}
        style={{ height, borderRadius: height / 2, backgroundColor: color }}
      />
    </View>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────────────────────────────────────

export function StatusPill({ status, advanceType, deductedTotal }: { status: string; advanceType: string; deductedTotal?: number }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const group = statusGroup(status);
  const look = {
    waiting: { bg: Colors.badgeYellowBg, fg: Colors.badgeYellowText, icon: 'clock-outline' },
    active: { bg: Colors.badgeBlueBg, fg: Colors.badgeBlueText, icon: 'progress-check' },
    done: { bg: Colors.badgeGreenBg, fg: Colors.badgeGreenText, icon: 'check-decagram' },
    rejected: { bg: Colors.badgeRedBg, fg: Colors.badgeRedText, icon: 'close-circle-outline' },
  }[group];
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]}>
      <MaterialCommunityIcons name={look.icon as any} size={12} color={look.fg} />
      <Text style={[styles.pillText, { color: look.fg }]}>{statusText({ status, advanceType, deductedTotal })}</Text>
    </View>
  );
}

/** The type badge: a wallet for a Salary Advance, a calendar of EMIs for a Term Loan. */
export function TypeIcon({ type, size = 40 }: { type: string; size?: number }) {
  const { C: Colors } = useTheme();
  const term = type === 'term';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: term ? Colors.badgeLeaveBg : Colors.badgeBlueBg,
      }}
    >
      <MaterialCommunityIcons
        name={term ? 'calendar-sync-outline' : 'wallet-outline'}
        size={size * 0.52}
        color={term ? Colors.badgeLeaveText : Colors.badgeBlueText}
      />
    </View>
  );
}

/** A failed load: what could not be loaded, and a Retry button. Never shown as "no data". */
export function ErrorBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.errorBox}>
      <MaterialCommunityIcons name="wifi-alert" size={22} color={Colors.badgeRedText} />
      <View style={{ flex: 1 }}>
        <Text style={styles.errorTitle}>{text}</Text>
        <Text style={styles.errorText}>Check your connection and try again.</Text>
      </View>
      <TouchableOpacity onPress={onRetry} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry">
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.badgeRedBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  errorTitle: { color: Colors.badgeRedText, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  errorText: { color: Colors.badgeRedText, fontSize: 11.5, marginTop: 1 },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.bgCard },
  retryText: { color: Colors.badgeRedText, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  banner: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    ...ClayElevation.low,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  bannerText: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  countBox: { alignItems: 'center', minWidth: 56 },
  countNum: { fontFamily: FontFamily.displayBold, fontSize: 26, lineHeight: 30 },
  countLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  strip: { gap: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.bgSurfaceHigh, justifyContent: 'center' },
  openPart: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 4, opacity: 0.85 },
  todayDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: Colors.bgCard,
  },
  stripLabels: { flexDirection: 'row', justifyContent: 'space-between', height: 14 },
  stripLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
});
