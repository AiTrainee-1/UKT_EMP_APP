import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { signOutDialog, type SignOutDialogState } from '../../hooks/useSignOut';
import { CONFIRM_TITLE } from '../../lib/signOutGuard';
import { useReduceMotion } from '../../lib/motionPrefs';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * The logout popup (owner 2026-11-25: instead of the system alert), opened by useConfirmSignOut()
 * (src/hooks/useSignOut.ts) and mounted once at the app root. Three faces:
 *   checking - opens at once while the app asks whether an On-Duty day is running; Logout waits;
 *   confirm  - a door with an arrow stepping out, "Are you sure?" or the offline-queue warning, Cancel / Logout;
 *   blocked  - an On-Duty day is running: why logging out is not possible now, OK / Open On-Duty.
 */
export function SignOutDialog() {
  const open = useSyncExternalStore(signOutDialog.subscribe, signOutDialog.get);
  // kept while the popup fades out, so it does not go blank first
  const last = useRef(open);
  if (open) last.current = open;
  const shown = open ?? last.current;
  return (
    <Modal
      transparent
      visible={!!open}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => signOutDialog.answer('cancel')}
    >
      {shown && <Dialog key={shown.id} state={shown.request} />}
    </Modal>
  );
}

function Dialog({ state }: { state: SignOutDialogState }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const blocked = state.kind === 'blocked';
  const checking = state.kind === 'checking';
  const waiting = state.kind === 'confirm' ? state.waiting : 0;

  const title = blocked ? state.title : CONFIRM_TITLE;
  const message =
    state.kind === 'blocked' ? state.message : state.kind === 'confirm' ? state.message : 'Checking whether your On-Duty is still running…';

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => signOutDialog.answer('cancel')} accessibilityLabel="Cancel" />
      <View style={styles.card} accessibilityViewIsModal testID="sign-out-dialog">
        {/* a new picture (and its pop) when "checking" turns into "On-Duty running" */}
        <Illustration key={blocked ? 'blocked' : 'confirm'} blocked={blocked} />
        <Text style={styles.title} accessibilityRole="header">{title}</Text>

        {waiting > 0 ? (
          <View style={styles.warn}>
            <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={C.statusYellow} />
            <Text style={styles.warnText}>{message}</Text>
          </View>
        ) : (
          <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>
        )}

        <View style={styles.buttons}>
          <Pressable
            onPress={() => signOutDialog.answer('cancel')}
            style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
            accessibilityRole="button"
            testID="sign-out-cancel"
          >
            <Text style={styles.btnGhostText}>{blocked ? 'OK' : 'Cancel'}</Text>
          </Pressable>
          {blocked ? (
            <Pressable
              onPress={() => signOutDialog.answer('open-on-duty')}
              style={({ pressed }) => [styles.btn, { backgroundColor: C.primary }, pressed && styles.pressed]}
              accessibilityRole="button"
              testID="sign-out-open-on-duty"
            >
              <Text style={styles.btnText}>Open On-Duty</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => signOutDialog.answer('logout')}
              disabled={checking}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: C.statusRed },
                (pressed || checking) && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: checking, busy: checking }}
              testID="sign-out-confirm"
            >
              {checking ? (
                <ActivityIndicator size="small" color={C.onPrimary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="logout" size={17} color={C.onPrimary} />
                  <Text style={styles.btnText}>Logout</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** A door with an arrow stepping out of it (logout), or a route pin that pulses (On-Duty running). */
function Illustration({ blocked }: { blocked: boolean }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const pop = useSharedValue(reduce ? 1 : 0.6);
  const loop = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    pop.value = withSpring(1, { damping: 8, stiffness: 200 });
    loop.value = withRepeat(
      withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 700 })),
      -1,
    );
    return () => cancelAnimation(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, blocked]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: 1 - loop.value * 0.6,
    transform: [{ translateX: loop.value * 9 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - loop.value),
    transform: [{ scale: 1 + loop.value * 0.45 }],
  }));

  const tint = blocked ? C.badgeYellowBg : C.badgeRedBg;
  const color = blocked ? C.statusYellow : C.statusRed;

  return (
    <View style={styles.art}>
      <Animated.View style={[styles.ring, { borderColor: color }, ringStyle]} />
      <Animated.View style={[styles.disc, { backgroundColor: tint }, discStyle]}>
        {blocked ? (
          <MaterialCommunityIcons name="map-marker-path" size={34} color={color} />
        ) : (
          <View style={styles.door}>
            <MaterialCommunityIcons name="door-open" size={34} color={color} />
            <Animated.View style={[styles.arrow, arrowStyle]}>
              <MaterialCommunityIcons name="arrow-right-bold" size={18} color={color} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xxl,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 18,
      alignItems: 'center',
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24 },
        android: { elevation: 14 },
      }),
    },
    art: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
    disc: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
    door: { width: 50, height: 40, justifyContent: 'center' },
    arrow: { position: 'absolute', right: -4, top: 11 },

    title: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 20, textAlign: 'center' },
    message: { color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
    warn: {
      flexDirection: 'row',
      gap: 10,
      alignSelf: 'stretch',
      marginTop: 12,
      padding: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: C.badgeYellowBg,
    },
    warnText: { flex: 1, color: C.textPrimary, fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 19 },

    buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 20 },
    btn: {
      flex: 1,
      minHeight: 48,
      borderRadius: BorderRadius.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
    },
    btnGhost: { borderWidth: 1.5, borderColor: C.outlineVariant, backgroundColor: C.bgCard },
    btnGhostText: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
    btnText: { color: C.onPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
    pressed: { opacity: 0.72 },
  });
