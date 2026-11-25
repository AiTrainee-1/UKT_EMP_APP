// "Your account is inactive" (owner 2026-11-25). An employee whose HRMS account is inactive may sign in (or still be
// signed in), but cannot use the app: they stay where they are (Home after signing in) under a full-screen cover that
// says why, shows HR's contact to get the account made active again, and counts 30 seconds down on a ring before the
// normal sign-out. Rules (pure, tested): src/lib/inactiveAccount.ts. Status: src/hooks/useAccountStatus.ts (GET /auth/me
// `accountStatus`). Mounted once in app/_layout.tsx. The approved-resignation flow keeps its own screen
// (/resignation/deactivated, ResignationGuard) and this cover stays out of its way.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useAuth } from '../hooks/useAuth';
import { useAccountStatus } from '../hooks/useAccountStatus';
import { useMyResignation } from '../hooks/useResignation';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { FontFamily, TabularNums } from '../constants/typography';
import { useAppActive, useReduceMotion } from '../lib/motionPrefs';
import {
  INACTIVE_LOGOUT_SECONDS,
  countdownAt,
  countdownSentence,
  shouldBlock,
} from '../lib/inactiveAccount';
import { ContactBlockCard } from './support/ContactBlockCard';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 148;
const STROKE = 10;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function InactiveAccountGate() {
  const { user, logout } = useAuth();
  const segments = useSegments() as string[];
  const employeeId = user?.employeeId ?? null;
  const { status, fresh } = useAccountStatus(employeeId);
  // the same query ResignationGuard polls (one request for both)
  const resignation = useMyResignation(employeeId);

  const block = shouldBlock({
    signedIn: !!employeeId,
    status,
    fresh,
    resignationSettled: !resignation.isLoading,
    resignationApproved: resignation.data?.status === 'approved',
    route: segments,
  });

  // The deadline is set once when the cover appears; an account made active again meanwhile clears it.
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    setDeadline(block ? Date.now() + INACTIVE_LOGOUT_SECONDS * 1000 : null);
  }, [block]);

  const signedOut = useRef(false);
  useEffect(() => {
    if (!block) signedOut.current = false;
  }, [block]);
  const signOut = () => {
    if (signedOut.current) return;
    signedOut.current = true;
    void logout();
  };

  return (
    <Modal
      visible={block && deadline != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      // the Back button cannot dismiss it: the app is not usable while the account is inactive
      onRequestClose={() => {}}
    >
      {block && deadline != null && <InactiveCover deadline={deadline} onSignOut={signOut} />}
    </Modal>
  );
}

function InactiveCover({ deadline, onSignOut }: { deadline: number; onSignOut: () => void }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const appActive = useAppActive();

  // The number: worked out from the clock four times a second, so it is right again after the app was in the background.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const c = countdownAt(deadline, now);

  useEffect(() => {
    if (c.done) onSignOut();
  }, [c.done, onSignOut]);

  // The ring empties smoothly over the time left (one linear animation on the UI thread, restarted when the app comes
  // back to the front). With Reduce motion it steps once a second instead.
  const remaining = useSharedValue(c.remaining);
  useEffect(() => {
    const at = countdownAt(deadline, Date.now());
    cancelAnimation(remaining);
    remaining.value = at.remaining;
    if (!reduce && !at.done) {
      remaining.value = withTiming(0, { duration: Math.max(0, deadline - Date.now()), easing: Easing.linear });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, reduce, appActive]);
  useEffect(() => {
    if (reduce) remaining.value = c.remaining;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, c.secondsLeft]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - remaining.value) }));

  // A small beat on the number each second (not with Reduce motion).
  const beat = useSharedValue(1);
  useEffect(() => {
    if (reduce || c.done) return;
    beat.value = withSequence(withTiming(1.08, { duration: 90 }), withTiming(1, { duration: 220 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.secondsLeft, reduce]);
  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  // The last 10 seconds turn the ring red.
  const ringColor = c.secondsLeft <= 10 ? Colors.statusRed : Colors.statusYellow;

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconOuter}>
          <View style={styles.iconInner}>
            <MaterialCommunityIcons name="account-lock-outline" size={38} color={Colors.badgeRedText} />
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Your account is inactive
        </Text>
        <Text style={styles.body}>
          Your account in HRMS is not active right now, so you cannot use the app while it is inactive.
        </Text>

        <View
          style={styles.ringWrap}
          accessible
          accessibilityRole="timer"
          accessibilityLabel={countdownSentence(c.secondsLeft)}
          accessibilityLiveRegion="polite"
          testID="inactive-account-countdown"
        >
          <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
            <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={Colors.bgSurfaceHigh} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={ringColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              animatedProps={ringProps}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <Animated.Text style={[styles.ringNumber, TabularNums, { color: ringColor }, numberStyle]}>
            {c.secondsLeft}
          </Animated.Text>
          <Text style={styles.ringUnit}>{c.secondsLeft === 1 ? 'second' : 'seconds'}</Text>
        </View>

        <Text style={styles.countdownText}>{countdownSentence(c.secondsLeft)}</Text>

        <View style={styles.hrNote}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.hrNoteText}>
            To make your account active again, please contact HR. Once HR has done it, sign in again.
          </Text>
        </View>

        <ContactBlockCard block={null} title="Contact HR" style={styles.contact} />

        <TouchableOpacity
          style={styles.signOut}
          onPress={onSignOut}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Sign out now"
          testID="inactive-account-sign-out"
        >
          <MaterialCommunityIcons name="logout" size={18} color={Colors.onPrimary} />
          <Text style={styles.signOutText}>Sign out now</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bgLight },
    content: { paddingHorizontal: 22, alignItems: 'center', gap: 14 },
    iconOuter: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: Colors.badgeRedBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconInner: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: Colors.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    title: {
      color: Colors.textPrimary,
      fontFamily: FontFamily.displayBold,
      fontSize: 24,
      textAlign: 'center',
      marginTop: 4,
    },
    body: { color: Colors.textSecondary, fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
    ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    ringNumber: { fontFamily: FontFamily.displayBold, fontSize: 46, lineHeight: 52 },
    ringUnit: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: -2 },
    countdownText: {
      color: Colors.textPrimary,
      fontFamily: FontFamily.bodySemibold,
      fontSize: 14,
      textAlign: 'center',
    },
    hrNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      alignSelf: 'stretch',
      backgroundColor: Colors.bgSurfaceLow,
      borderRadius: BorderRadius.lg,
      padding: 12,
      marginTop: 6,
    },
    hrNoteText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
    contact: { alignSelf: 'stretch' },
    signOut: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      marginTop: 4,
    },
    signOutText: { color: Colors.onPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 15 },
  });
