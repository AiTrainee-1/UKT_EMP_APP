import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Svg, { Circle } from 'react-native-svg';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, ClayElevation } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import {
  salaryAdvanceWindow,
  statusGroup,
  statusText,
  termLoanWindow,
  windowHeadline,
  windowStrip,
  type WindowSource,
} from '../../lib/settlement';

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

// ─── Window banner: the Salary Advance window (the 20th to the 22nd, owner 2026-11-25) on a strip of the month ─────
// A Term Loan has no window any more: a line under the strip says it can be applied for on any day. An older server
// sends one window for both forms (the 20th to the month end); the banner then shows that one, worded by the server.

export function WindowBanner({ data }: { data: WindowSource & { today: string } }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotionPref();

  const window = salaryAdvanceWindow(data);
  const separate = !!data.windows?.general; // the current server: each form has its own window
  const termAnyDay = separate && termLoanWindow(data) === null;
  const strip = windowStrip(window, data.today);
  const tone = window.isOpen ? Colors.statusGreen : Colors.statusYellow;
  const big = window.isOpen ? (window.daysLeft ?? 0) : window.daysUntilOpen;
  const headline = windowHeadline(window);
  const rule = separate
    ? 'Salary Advance: apply from the 20th to the 22nd of each month.'
    : window.message;

  return (
    <View
      style={[styles.banner, { borderColor: window.isOpen ? Colors.badgeGreenBg : Colors.badgeYellowBg }]}
      accessibilityRole="summary"
      accessibilityLabel={`${separate ? 'Salary Advance. ' : ''}${headline}. ${window.message}`}
      testID="settlement-window-banner"
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
          {separate && <Text style={styles.bannerKicker}>SALARY ADVANCE WINDOW</Text>}
          <Text style={styles.bannerTitle}>{headline}</Text>
          <Text style={styles.bannerText}>{rule}</Text>
        </View>
        <View style={styles.countBox}>
          <Text style={[styles.countNum, TabularNums, { color: tone }]}>{big}</Text>
          <Text style={styles.countLabel}>{window.isOpen ? (big === 1 ? 'day left' : 'days left') : big === 1 ? 'day to go' : 'days to go'}</Text>
        </View>
      </View>

      {strip && (
        <View style={styles.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.track}>
            <View
              style={[
                styles.openPart,
                {
                  left: `${strip.startPct}%`,
                  // at least a few points wide, so a 3-day window still reads as a lit stretch
                  width: `${Math.max(strip.endPct - strip.startPct, 3)}%`,
                  backgroundColor: Colors.statusGreen,
                },
              ]}
            />
            <MotiView
              from={reduce ? undefined : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'timing', duration: reduce ? 0 : 420, delay: reduce ? 0 : 200 }}
              style={[styles.todayDot, { left: `${strip.todayPct}%`, borderColor: tone }]}
            />
          </View>
          <View style={styles.stripLabels}>
            <Text style={styles.stripLabel}>1</Text>
            <Text style={[styles.stripLabel, styles.stripOpenLabel, { left: `${strip.startPct}%` }]}>
              {strip.toDay > strip.fromDay ? `${strip.fromDay}–${strip.toDay}` : `${strip.fromDay}`}
            </Text>
            <Text style={styles.stripLabel}>{strip.lastDay}</Text>
          </View>
        </View>
      )}

      {termAnyDay && (
        <View style={styles.termLine} testID="settlement-term-any-day">
          <MaterialCommunityIcons name="check-circle" size={15} color={Colors.statusGreen} />
          <Text style={styles.termText}>
            <Text style={styles.termStrong}>Term Loan: </Text>
            you can apply on any day.
          </Text>
        </View>
      )}
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
  bannerKicker: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 1 },
  bannerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  bannerText: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  countBox: { alignItems: 'center', minWidth: 56 },
  countNum: { fontFamily: FontFamily.displayBold, fontSize: 26, lineHeight: 30 },
  countLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  strip: { gap: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.bgSurfaceHigh, justifyContent: 'center' },
  openPart: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4, opacity: 0.85 },
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
  stripOpenLabel: { position: 'absolute', marginLeft: -6, color: Colors.statusGreen, fontWeight: '800' },
  termLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: Colors.outlineVariant, paddingTop: 10,
  },
  termText: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  termStrong: { fontFamily: FontFamily.bodySemibold, color: Colors.textPrimary },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
});
