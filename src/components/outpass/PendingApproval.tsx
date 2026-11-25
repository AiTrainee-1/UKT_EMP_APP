import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useReduceMotion } from '../../lib/motionPrefs';
import { FontFamily } from '../../constants/typography';

const AMBER = '#B45309';
const AMBER_SOFT = '#FEF3C7';
const AMBER_RING = 'rgba(245,158,11,0.35)';

/**
 * The bell of a pass that waits for approval: it rings now and then, and a soft ring pulses out of it - "still pending"
 * at a glance. Still when the phone asks for reduced motion.
 */
export function PendingBell({ size = 22 }: { size?: number }) {
  const reduce = useReduceMotion();
  const swing = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      cancelAnimation(swing);
      cancelAnimation(pulse);
      swing.value = 0;
      pulse.value = 0;
      return;
    }
    swing.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 90 }),
        withTiming(14, { duration: 120 }),
        withTiming(-10, { duration: 110 }),
        withTiming(8, { duration: 100 }),
        withTiming(0, { duration: 90 }),
        withTiming(0, { duration: 1500 }),
      ),
      -1,
    );
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1);
    return () => {
      cancelAnimation(swing);
      cancelAnimation(pulse);
    };
  }, [reduce]);

  const bell = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.value}deg` }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.8 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.9 }] }));
  const box = size + 16;

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: box, height: box, borderRadius: box / 2, backgroundColor: AMBER_RING }, ring]} />
      <Animated.View style={bell}>
        <MaterialCommunityIcons name="bell-ring-outline" size={size} color={AMBER} />
      </Animated.View>
    </View>
  );
}

/**
 * Where the QR will be: a placeholder that says the QR comes with the approval, and a Refresh button to look again now
 * (the screen also looks again on its own every few seconds).
 */
export function PendingQrPlaceholder({
  onRefresh,
  refreshing,
  size = 168,
  what = 'this pass',
}: {
  onRefresh?: () => unknown;
  refreshing?: boolean;
  size?: number;
  /** What waits for the approval: "your On-Duty" / "this pass". */
  what?: string;
}) {
  // Feedback for the tap (2026-11-25): the check is often too quick to see a spinner, so it spins for at least a moment
  // and then says when it looked ("Still waiting · checked 9:37 AM"). Once approved the card shows the QR instead.
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const busy = checking || !!refreshing;
  const check = async () => {
    if (!onRefresh || busy) return;
    setChecking(true);
    const started = Date.now();
    try {
      await onRefresh();
    } catch {
      /* the screen shows its own connection notice */
    }
    const wait = 600 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setChecking(false);
    setCheckedAt(new Date());
  };
  const checkedText = checkedAt
    ? `Still waiting · checked ${checkedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
    : null;

  return (
    <View style={s.wrap}>
      <View style={[s.frame, { width: size + 20, height: size + 20 }]} accessible accessibilityLabel="QR code: available after approval">
        <PendingBell size={30} />
        <Text style={s.title}>QR after approval</Text>
        <Text style={s.text}>The QR appears here as soon as HR or your Department Head approves {what}.</Text>
      </View>
      {onRefresh && (
        <Pressable
          onPress={() => void check()}
          disabled={busy}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Check for approval now"
        >
          {busy ? <ActivityIndicator size="small" color={AMBER} /> : <MaterialCommunityIcons name="refresh" size={18} color={AMBER} />}
          <Text style={s.btnText}>{busy ? 'Checking...' : 'Refresh'}</Text>
        </Pressable>
      )}
      {onRefresh && !busy && checkedText && (
        <Text style={s.checked} accessibilityLiveRegion="polite">
          {checkedText}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 16, gap: 10 },
  frame: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F59E0B',
    backgroundColor: AMBER_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  title: { color: AMBER, fontFamily: FontFamily.headlineSemibold, fontSize: 14, textAlign: 'center' },
  text: { color: '#92400E', fontSize: 11.5, textAlign: 'center', lineHeight: 15 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: AMBER,
    backgroundColor: '#FFFBEB',
  },
  btnText: { color: AMBER, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  checked: { color: '#92400E', fontSize: 11.5, textAlign: 'center' },
});
