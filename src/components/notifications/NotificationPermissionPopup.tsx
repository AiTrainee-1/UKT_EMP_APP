import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from '../../hooks/useAuth';
import {
  askNotificationAccess,
  openNotificationSettings,
  readNotificationAccess,
  useNotificationPopupHeld,
} from '../../hooks/useNotificationPermission';
import { registerPushToken } from '../../hooks/usePushToken';
import {
  NOTIFICATION_NUDGE_KEY,
  NOTIFICATION_REASONS,
  notificationButtonAction,
  parseShownAt,
  shouldOfferNotifications,
  type NotificationAccess,
} from '../../lib/notificationNudge';
import { percent } from '../../lib/mangaShapes';
import { useReduceMotion } from '../../lib/motionPrefs';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily } from '../../constants/typography';
import {
  IconBurst,
  MangaButton,
  MangaFrame,
  MangaLink,
  MangaPanel,
  Mascot,
  SpeechBubble,
  makeMangaStyles,
  mascotHeight,
  useMangaMotion,
} from '../manga';

/** Let the first screen settle (and the first-run permission dialogs start) before deciding. */
const SETTLE_MS = 1500;
/** "Notifications are on" stays this long before the popup closes by itself. */
const ON_HOLD_MS = 1100;

/**
 * "Turn on notifications" (owner 2026-11-25): when the app's notifications are off, a manga-style card (the update
 * popup's look, src/components/manga) says why they matter - approvals, request updates, enquiry replies, the gate pass -
 * with "Turn on notifications" and "Not now". Mounted once in src/components/transitions/AppOverlays.tsx.
 *
 * Loop-safe on purpose (2026-11-25, keyboard bug on Redmi / Infinix, see src/lib/notificationNudge.ts):
 *   - only while someone is signed in and past the sign-in screens;
 *   - decided once per sign-in session, at most once a day (kept on the phone), never while the first-run permission
 *     dialogs, the "Permission Needed" card or the app tour are up (holdNotificationPopup);
 *   - the phone's dialog opens only on a tap of "Turn on notifications" (or its settings page, once it will not ask
 *     again); coming back to the app only reads the permission, to close the popup once notifications are on.
 */
export function NotificationPermissionPopup() {
  const { user } = useAuth();
  const segments = useSegments() as string[];
  const onAuthScreens = segments.length === 0 || segments[0] === '(auth)';
  const employeeId = user?.employeeId ?? null;
  const active = employeeId != null && !onAuthScreens;
  const held = useNotificationPopupHeld();
  const [offer, setOffer] = useState<{ id: number; access: NotificationAccess } | null>(null);
  /** Whose sign-in session this was already decided for. */
  const decidedFor = useRef<number | null>(null);

  // Signed out: forget, so the next sign-in decides again.
  useEffect(() => {
    if (employeeId != null) return;
    decidedFor.current = null;
    setOffer(null);
  }, [employeeId]);

  // Decide once per sign-in session, when the screen has settled and nothing holds the popup back. Reads only.
  useEffect(() => {
    if (!active || held || employeeId == null || decidedFor.current === employeeId) return;
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const access = await readNotificationAccess();
        const lastShownAt = parseShownAt(await AsyncStorage.getItem(NOTIFICATION_NUDGE_KEY).catch(() => null));
        if (!alive) return;
        decidedFor.current = employeeId;
        if (!access || !shouldOfferNotifications(access, lastShownAt, Date.now())) return;
        AsyncStorage.setItem(NOTIFICATION_NUDGE_KEY, String(Date.now())).catch(() => {});
        setOffer({ id: Date.now(), access });
      })();
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, held, employeeId]);

  const close = useCallback(() => setOffer(null), []);

  // Hidden (not dropped) while something holds it back; it comes back afterwards.
  if (!offer || !active || held) return null;
  return <Popup key={offer.id} initial={offer.access} onClose={close} />;
}

function Popup({ initial, onClose }: { initial: NotificationAccess; onClose: () => void }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const manga = useThemedStyles(makeMangaStyles);
  const reduce = useReduceMotion();
  const motion = useMangaMotion({ reduce });
  const [access, setAccess] = useState(initial);
  const [on, setOn] = useState(false);
  const [asking, setAsking] = useState(false);
  const [declined, setDeclined] = useState(false);
  const closing = useRef(false);
  const toSettings = notificationButtonAction(access) === 'settings';

  const finish = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onClose();
  }, [onClose]);

  const onRef = useRef(false);
  const turnedOn = useCallback(() => {
    if (onRef.current) return;
    onRef.current = true;
    setOn(true);
    // Now that they are allowed, connect this phone for push messages (it only checks, never asks).
    void registerPushToken();
  }, []);

  // Back in the app (from the phone's dialog or its settings): only READ the permission, to close once it is on.
  // Never asks from here (the keyboard loop of 2026-11-25). Also read once now, for a popup coming back after a hold.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const now = await readNotificationAccess();
      if (!alive || !now) return;
      if (now.granted) turnedOn();
      else setAccess(now);
    };
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [turnedOn]);

  // On: show it for a moment, then close by itself.
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(finish, ON_HOLD_MS);
    return () => clearTimeout(t);
  }, [on, finish]);

  const notNow = useCallback(() => {
    // At most once a day after "Not now".
    AsyncStorage.setItem(NOTIFICATION_NUDGE_KEY, String(Date.now())).catch(() => {});
    finish();
  }, [finish]);

  // Android's back button = "Not now" (this card is drawn over the screens, not in a Modal).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      notNow();
      return true;
    });
    return () => sub.remove();
  }, [notNow]);

  const turnOn = async () => {
    if (toSettings) {
      openNotificationSettings();
      return;
    }
    setAsking(true);
    setDeclined(false);
    try {
      const after = await askNotificationAccess();
      if (after?.granted) turnedOn();
      else {
        setDeclined(true);
        if (after) setAccess(after);
      }
    } finally {
      setAsking(false);
    }
  };

  const tint = on ? C.statusGreen : C.secondary;
  const paper = on ? C.badgeGreenBg : C.secondaryFixed;
  // The update card's mascot spot (104 wide, 26 in, 6 below the edge): the focus lines point at its face.
  const face = { x: MASCOT_LEFT + 52, y: PANEL_H + 6 - mascotHeight(104) + 50 };

  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="notification-permission-popup">
      <Animated.View style={[StyleSheet.absoluteFill, manga.backdrop, motion.backdropStyle]} />
      <Animated.View style={[styles.cardWrap, motion.cardStyle]}>
        <MangaFrame shadowColor={tint}>
          <MangaPanel
            height={PANEL_H}
            paper={paper}
            dots={tint}
            clear={{ cx: '28%', cy: percent(face.y, PANEL_H), r: '45%' }}
            focus={face}
            spin={motion.spin}
            sparkle={reduce || !on ? null : motion.sparkle}
            sparkleSpots={SPARKLES}
            sparkleColors={{ color: C.statusGreen, accent: C.secondary }}
          >
            <Animated.View style={[styles.mascot, motion.mascotStyle]}>
              <Mascot wave={motion.wave} blink={motion.blink} decorative />
            </Animated.View>

            <SpeechBubble style={styles.bubble} animatedStyle={motion.bubbleStyle}>
              <Text style={manga.bubbleText}>{on ? 'Yay, you are all set!' : 'Don’t miss a thing!'}</Text>
            </SpeechBubble>

            <View style={styles.bell}>
              <RingingBell on={on} reduce={reduce} />
            </View>
          </MangaPanel>

          <View style={styles.body}>
            <Text style={manga.title} accessibilityRole="header" accessibilityLiveRegion="polite">
              {on ? 'Notifications are on' : 'Turn on notifications'}
            </Text>
            <Text style={manga.sub}>
              {on ? 'Thanks! You will hear about these right away.' : 'Notifications are off for this app. Turn them on to hear about these right away:'}
            </Text>

            {!on && (
              <>
                <View style={styles.reasons}>
                  {NOTIFICATION_REASONS.map((r) => (
                    <View key={r.text} style={styles.reason}>
                      <View style={styles.reasonIcon}>
                        <MaterialCommunityIcons name={r.icon as any} size={15} color={C.textPrimary} />
                      </View>
                      <Text style={styles.reasonText}>{r.text}</Text>
                    </View>
                  ))}
                </View>

                {declined && (
                  <View style={[manga.note, styles.note]}>
                    <MaterialCommunityIcons name="information-outline" size={16} color={C.textSecondary} />
                    <Text style={[manga.noteText, styles.noteText]}>
                      Still off. You can turn notifications on any time in your phone's settings.
                    </Text>
                  </View>
                )}

                <MangaButton
                  label={asking ? 'Asking…' : 'Turn on notifications'}
                  icon={toSettings ? 'cog-outline' : 'bell-ring-outline'}
                  onPress={() => { void turnOn(); }}
                  disabled={asking}
                  busy={asking}
                  accessibilityHint={toSettings ? "Opens your phone's settings for this app" : undefined}
                  style={styles.btnWrap}
                  testID="notification-popup-turn-on"
                />
                {toSettings && (
                  <Text style={styles.hint}>
                    {Platform.OS === 'ios'
                      ? 'Opens Settings: tap Notifications and turn on Allow Notifications, then come back.'
                      : 'Opens your phone’s settings for this app: turn on Notifications, then come back.'}
                  </Text>
                )}
                <MangaLink label="Not now" onPress={notNow} testID="notification-popup-not-now" />
              </>
            )}
          </View>
        </MangaFrame>
      </Animated.View>
    </View>
  );
}

/** A bell on a burst that rings now and then; green with a tick once notifications are on. */
function RingingBell({ on, reduce }: { on: boolean; reduce: boolean }) {
  const { C } = useTheme();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduce || on) {
      cancelAnimation(ring);
      ring.value = reduce ? 0 : withTiming(0, { duration: 160 });
      return;
    }
    ring.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(16, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(-14, { duration: 120 }),
          withTiming(10, { duration: 110 }),
          withTiming(-7, { duration: 100 }),
          withTiming(0, { duration: 90 }),
          withTiming(0, { duration: 1500 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(ring);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, on]);
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 }, { rotate: `${ring.value}deg` }, { translateY: 6 }] }));
  const color = on ? C.statusGreen : C.secondary;
  return (
    <IconBurst size={78} color={color} face={C.bgCard} ink={C.textPrimary}>
      <Animated.View style={bellStyle} accessible accessibilityLabel={on ? 'Notifications are on' : 'Notifications are off'}>
        <MaterialCommunityIcons name={on ? 'bell-check' : 'bell-ring'} size={25} color={C.textPrimary} />
      </Animated.View>
    </IconBurst>
  );
}

const PANEL_H = 168;
const MASCOT_LEFT = 22;
/** The celebration stars once notifications are on: clear of the bubble and the bell. */
const SPARKLES = [
  { left: 14, top: 20, size: 14, phase: 0 },
  { left: 134, top: 104, size: 12, phase: 0.35 },
  { left: 188, top: 146, size: 10, phase: 0.7 },
];

const makeStyles = (C: Palette) => {
  const ink = C.textPrimary;
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      // Under the update popup (1000) and the "Permission Needed" card (999).
      zIndex: 990,
      elevation: 990,
    },
    cardWrap: { width: '100%', maxWidth: 360 },
    mascot: { position: 'absolute', left: MASCOT_LEFT, bottom: -6 },
    bubble: { position: 'absolute', top: 14, right: 14, maxWidth: 150 },
    bell: { position: 'absolute', right: 20, bottom: 10 },

    body: { padding: 18, paddingTop: 16 },
    reasons: { marginTop: 12, gap: 8 },
    reason: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reasonIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: ink,
      backgroundColor: C.secondaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reasonText: { flex: 1, color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, lineHeight: 18 },
    note: { flexDirection: 'row', gap: 8, marginTop: 14 },
    noteText: { flex: 1 },
    btnWrap: { marginTop: 16, marginRight: 4, marginBottom: 4 },
    hint: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 10 },
  });
};
