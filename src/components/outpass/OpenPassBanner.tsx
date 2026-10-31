import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { format } from 'date-fns';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { formatSpan, formatTicker, openPassClock, type OpenPassInput } from '../../lib/outpassOpen';
import { useReduceMotion } from '../myrequests/useReduceMotion';

/**
 * The live strip on top of the pinned gate pass: "You are out - 1 h 05 min" with how long until the expected return
 * (red once late), or "Pass ready - go out within 42:10" while the exit QR is valid. Ticks every second.
 */
export function OpenPassBanner({ pass }: { pass: OpenPassInput }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const [now, setNow] = useState(() => Date.now());
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = openPassClock(pass, now);
  if (!clock) return null;

  const out = clock.kind === 'out';
  const late = out && clock.overdue;
  const tone = late ? Colors.statusRed : out ? Colors.statusOrange : Colors.statusGreen;
  const bg = late ? Colors.badgeRedBg : out ? Colors.badgeYellowBg : Colors.badgeGreenBg;
  const progress = clock.progress;

  let title: string;
  let big: string;
  let sub: string | null;
  if (clock.kind === 'out') {
    title = 'You are out of the gate';
    big = formatTicker(clock.elapsedMs);
    const backBy = pass.expectedReturnAt ? format(new Date(pass.expectedReturnAt), 'h:mm a') : null;
    sub = clock.returnInMs == null
      ? 'Scan the return QR at the gate when you are back.'
      : clock.overdue
        ? `Late by ${formatSpan(clock.returnInMs)} · you said you would be back by ${backBy}`
        : `Back by ${backBy} · ${formatSpan(clock.returnInMs)} left`;
  } else {
    title = 'Your pass is ready';
    big = formatTicker(clock.exitWindowMs);
    sub = 'Go out through the gate before this runs out. Show the QR below.';
  }

  return (
    <View
      style={[styles.wrap, { backgroundColor: bg, borderColor: tone }]}
      accessible
      accessibilityLabel={`${title}. ${out ? 'Out for' : 'Time left'} ${big}. ${sub ?? ''}`}
      testID="outpass-open-banner"
    >
      <View style={styles.top}>
        <View style={styles.liveRow}>
          <MotiView
            from={{ opacity: 1, scale: 1 }}
            animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0.25, scale: 1.6 }}
            transition={reduceMotion ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 900, loop: true }}
            style={[styles.liveDot, { backgroundColor: tone }]}
          />
          <Text style={[styles.title, { color: tone }]}>{title.toUpperCase()}</Text>
        </View>
        <MaterialCommunityIcons name={out ? 'walk' : 'qrcode-scan'} size={18} color={tone} />
      </View>
      <View style={styles.bigRow}>
        <Text style={[styles.big, TabularNums]}>{big}</Text>
        <Text style={styles.bigUnit}>{out ? 'out for' : 'left to go out'}</Text>
      </View>
      {progress != null && (
        <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
          <MotiView
            animate={{ width: Math.max(6, progress * trackWidth) }}
            transition={{ type: 'timing', duration: 600 }}
            style={[styles.fill, { backgroundColor: tone }]}
          />
        </View>
      )}
      {!!sub && <Text style={[styles.sub, late && { color: Colors.statusRed, fontWeight: '800' }]}>{sub}</Text>}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: { borderRadius: BorderRadius.xl, borderWidth: 1.5, padding: 14, gap: 8, marginBottom: 10 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    title: { fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },
    bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    big: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 32, lineHeight: 38 },
    bigUnit: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    track: { height: 6, borderRadius: 3, backgroundColor: Colors.bgCard, overflow: 'hidden' },
    fill: { height: 6, borderRadius: 3 },
    sub: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  });
