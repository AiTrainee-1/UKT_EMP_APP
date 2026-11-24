import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthColors, AuthFont } from './authTheme';
import { useReduceMotion } from '../../lib/motionPrefs';
import type { LoginChannelState } from '../../lib/otp';

const ICON: Record<LoginChannelState['channel'], keyof typeof MaterialCommunityIcons.glyphMap> = {
  sms: 'message-text-outline',
  whatsapp: 'whatsapp',
};
const TINT: Record<LoginChannelState['channel'], string> = { sms: '#2563EB', whatsapp: '#16A34A' };

/** The padlock of a locked option: a small shake every few seconds ("not now"), still with reduced motion. */
function WigglingLock() {
  const reduce = useReduceMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(turn);
      turn.value = 0;
      return;
    }
    turn.value = withRepeat(
      withDelay(
        2200,
        withSequence(
          withTiming(-12, { duration: 70 }),
          withTiming(12, { duration: 90 }),
          withTiming(-8, { duration: 80 }),
          withTiming(6, { duration: 70 }),
          withTiming(0, { duration: 60 }),
        ),
      ),
      -1,
    );
    return () => cancelAnimation(turn);
  }, [reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name="lock" size={14} color="#64748B" />
    </Animated.View>
  );
}

/**
 * "Continue with SMS OTP" / "Continue with WhatsApp OTP" on the login page (owner 2026-11-24). An option HR switched off
 * stays on screen, LOCKED: greyed, a padlock that shakes now and then, "Not enabled", and it cannot be chosen.
 */
export function LoginMethodOption({ state, onPress }: { state: LoginChannelState; onPress: () => void }) {
  const locked = !state.enabled;
  const tint = TINT[state.channel];
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={locked}
      style={({ pressed }) => [s.card, locked ? s.cardLocked : { borderColor: tint + '55' }, pressed && !locked && s.pressed]}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={locked ? `${state.label}: locked. ${state.lockedReason ?? ''}` : `Continue with ${state.label}`}
      testID={`login-method-${state.channel}`}
    >
      <View style={[s.iconWell, { backgroundColor: locked ? '#F1F5F9' : tint + '18' }]}>
        <MaterialCommunityIcons name={ICON[state.channel]} size={20} color={locked ? '#94A3B8' : tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, locked && s.titleLocked]} numberOfLines={1}>
          {locked ? state.label : `Continue with ${state.label}`}
        </Text>
        {locked ? (
          <View style={s.lockedRow}>
            <WigglingLock />
            <Text style={s.lockedBadge}>NOT ENABLED</Text>
          </View>
        ) : (
          <Text style={s.sub}>Get a one-time code</Text>
        )}
      </View>
      <MaterialCommunityIcons name={locked ? 'lock-outline' : 'chevron-right'} size={18} color={locked ? '#94A3B8' : tint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  cardLocked: { borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: '#F8FAFC' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  iconWell: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#0F2F2C', fontFamily: AuthFont.bodyBold, fontSize: 14 },
  titleLocked: { color: '#64748B' },
  sub: { color: AuthColors.accentDark, fontFamily: AuthFont.body, fontSize: 11.5, marginTop: 1 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  lockedBadge: { color: '#64748B', fontFamily: AuthFont.bodyBold, fontSize: 10.5, letterSpacing: 0.8 },
});
