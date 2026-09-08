import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Easing, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius, Spacing, ClayElevation } from '../constants/theme';
import { useGeoPunchStatus, useGeoPunch } from '../hooks/useGeoAttendance';

/**
 * Slide to Punch -the whole Office Geo Punch flow behind one gesture, in the
 * slide-to-unlock shape: a thumb dragged the length of a track.
 *
 * Slide rather than tap on purpose: this writes attendance the instant it
 * fires, with no confirm step, so it must not be triggerable by a stray tap
 * on a scrolling home screen. The length of the track IS the confirmation.
 *
 * Lives OUTSIDE the home ScrollView, pinned above the tab bar. Horizontal
 * travel also means it never competes with the vertical scroll for the
 * gesture, which a swipe-up control inherently does.
 *
 * There is deliberately no daily limit here. The backend records every punch
 * an employee makes; the 4-punch model still governs pay, but it selects
 * from the punches rather than capping them. Location is the only gate -a
 * punch is refused for being in the wrong PLACE, never for being the fifth.
 */

/** Which way the thumb travels. 'ltr' is the iPhone slide-to-unlock
 *  direction; flip to 'rtl' to start the thumb on the right instead. */
const DIRECTION: 'ltr' | 'rtl' = 'ltr';

const THUMB = 50;
const PAD = 6;
const FIRE_AT = 0.82;       // fraction of the track that commits the punch
const RESULT_MS = 4500;     // how long a result stays on screen

type Phase = 'idle' | 'working' | 'success' | 'info' | 'error';

interface Result {
  phase: Exclude<Phase, 'idle' | 'working'>;
  title: string;
  detail?: string;
}

/** Pulls something an employee can act on out of an axios failure. The geo
 *  punch endpoint answers 403 with {status:"rejected", message} when they're
 *  outside the branch radius, and {error} for everything else. */
function describeError(err: any): Result {
  const data = err?.response?.data;
  if (data?.status === 'rejected') {
    return {
      phase: 'error',
      title: 'Outside your branch radius',
      detail: data.message ?? (data.distanceM != null ? `${data.distanceM}m away (allowed ${data.radiusM}m)` : undefined),
    };
  }
  const message = data?.error ?? data?.message;
  if (message) return { phase: 'error', title: 'Punch not recorded', detail: message };
  if (err?.message === 'Network Error') {
    return { phase: 'error', title: 'No connection', detail: 'Check your network and slide again.' };
  }
  return { phase: 'error', title: 'Punch not recorded', detail: err?.message ?? 'Please try again.' };
}

export function SlideToPunch() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { data: status } = useGeoPunchStatus();
  const punchMutation = useGeoPunch();

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [trackW, setTrackW] = useState(0);

  const x = useRef(new Animated.Value(0)).current;   // 0 .. maxX, in travel direction
  const xValue = useRef(0);
  const shimmer = useRef(new Animated.Value(0)).current;

  const maxX = Math.max(1, trackW - THUMB - PAD * 2);
  const maxRef = useRef(maxX);
  maxRef.current = maxX;

  const onDutySession = status?.onDutySession;
  const isOnDuty = onDutySession != null && onDutySession.status === 'active';

  // An on-duty punch needs a selfie, so it can't be done from a gesture —
  // the slide hands over to that screen instead of failing at the server.
  const mode: 'punch' | 'on_duty' = isOnDuty ? 'on_duty' : 'punch';
  // No "day complete" state: office punches are uncapped.
  const armed = phase === 'idle' && trackW > 0;

  // Read inside the PanResponder, which is created once and would otherwise
  // close over the first render's values forever.
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const punchesToday = status?.punches?.length ?? 0;

  // ── Shimmer along the track, only while there's something to slide for ──
  useEffect(() => {
    if (!armed || result) {
      shimmer.stopAnimation();
      shimmer.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [armed, result, shimmer]);

  const settle = (to: number) =>
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 16 }).start();

  const reset = () => {
    xValue.current = 0;
    settle(0);
  };

  const finish = (r: Result) => {
    setResult(r);
    setPhase(r.phase);
    reset();
    setTimeout(() => {
      setResult(null);
      setPhase('idle');
    }, RESULT_MS);
  };

  /** Everything the slide commits to: permission, GPS fix, punch. */
  const runPunch = async () => {
    setPhase('working');
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      // Requesting is allowed here because the slide is a real user gesture —
      // the OS only reliably shows the dialog off the back of one.
      if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        finish({
          phase: 'error',
          title: 'Location access needed',
          detail: 'Allow location for UKTextiles in your phone settings, then slide again.',
        });
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const res = await punchMutation.mutateAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        isMocked: (pos as { mocked?: boolean }).mocked ?? false,
      });

      if (res.status === 'already_recorded') {
        finish({ phase: 'info', title: 'Already recorded', detail: 'This punch was logged earlier.' });
        return;
      }
      if (res.status === 'rejected') {
        finish({ phase: 'error', title: 'Outside your branch radius', detail: res.message });
        return;
      }
      finish({
        phase: 'success',
        title: res.punchType === 'OUT' ? 'Checked out' : 'Checked in',
        detail: [
          res.punchNumber != null ? `Punch ${res.punchNumber}` : null,
          res.time?.slice(0, 5),
          res.distanceM != null ? `${res.distanceM}m from branch` : null,
        ].filter(Boolean).join(' · '),
      });
    } catch (err: any) {
      finish(describeError(err));
    }
  };

  const commit = () => {
    if (modeRef.current === 'on_duty') {
      reset();
      router.push('/on-duty');
      return;
    }
    runPunch();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => armedRef.current,
        // Horizontal intent only, so a vertical flick still scrolls the page
        // behind rather than being swallowed by the track.
        onMoveShouldSetPanResponder: (_, g) =>
          armedRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 3,
        onPanResponderMove: (_, g) => {
          if (!armedRef.current) return;
          const travelled = DIRECTION === 'ltr' ? g.dx : -g.dx;
          const next = Math.max(0, Math.min(maxRef.current, travelled));
          xValue.current = next;
          x.setValue(next);
        },
        onPanResponderRelease: () => {
          if (!armedRef.current) return;
          if (xValue.current >= maxRef.current * FIRE_AT) {
            xValue.current = maxRef.current;
            settle(maxRef.current);
            commit();
          } else {
            reset();
          }
        },
        onPanResponderTerminate: () => reset(),
      }),
    // Created once -state is read through refs above, so it never goes stale.
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const progress = x.interpolate({ inputRange: [0, maxX], outputRange: [0, 1], extrapolate: 'clamp' });
  const thumbShift = DIRECTION === 'ltr' ? x : Animated.multiply(x, -1);

  const tone =
    result?.phase === 'success' ? Colors.statusGreen
    : result?.phase === 'error' ? Colors.statusRed
    : result?.phase === 'info' ? Colors.tertiary
    : mode === 'on_duty' ? Colors.tertiary
    : Colors.primary;

  const label =
    phase === 'working' ? 'Recording your punch…'
    : result ? result.title
    : mode === 'on_duty' ? 'Slide for On-Duty punch'
    : 'Slide to punch';

  const sub =
    phase === 'working' ? 'Finding your location'
    : result?.detail
    ?? (mode === 'on_duty'
      ? 'Needs a selfie -opens On-Duty'
      : punchesToday > 0
        ? `${punchesToday} punch${punchesToday === 1 ? '' : 'es'} recorded today`
        : 'No punches yet today');

  const thumbIcon =
    phase === 'working' ? null
    : result?.phase === 'success' ? 'check'
    : result?.phase === 'error' ? 'alert'
    : result?.phase === 'info' ? 'information-outline'
    : mode === 'on_duty' ? 'briefcase-outline'
    : DIRECTION === 'ltr' ? 'chevron-double-right' : 'chevron-double-left';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={styles.track}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        {/* Trail behind the thumb, so how far is left to go is visible. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.trail,
            DIRECTION === 'ltr' ? { left: 0 } : { right: 0 },
            { backgroundColor: tone, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] }) },
          ]}
        />

        <View style={styles.copy} pointerEvents="none">
          <Text style={[styles.label, { color: tone }]} numberOfLines={1}>{label}</Text>
          {!!sub && <Text style={styles.sub} numberOfLines={1}>{sub}</Text>}
        </View>

        <Animated.View
          {...pan.panHandlers}
          style={[
            styles.thumb,
            DIRECTION === 'ltr' ? { left: PAD } : { right: PAD },
            { backgroundColor: tone, transform: [{ translateX: thumbShift }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={armed ? 'Slide across to record your attendance punch' : undefined}
          accessibilityState={{ disabled: !armed }}
        >
          {phase === 'working' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Animated.View
              style={
                armed && !result
                  ? {
                      opacity: shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.45, 1] }),
                      transform: [{
                        translateX: shimmer.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, DIRECTION === 'ltr' ? 4 : -4],
                        }),
                      }],
                    }
                  : undefined
              }
            >
              <MaterialCommunityIcons name={thumbIcon as any} size={24} color="#fff" />
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  track: {
    height: THUMB + PAD * 2,
    borderRadius: (THUMB + PAD * 2) / 2,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    overflow: 'hidden',
    ...ClayElevation.low,
  },
  trail: { position: 'absolute', top: 0, bottom: 0, width: '100%', borderRadius: BorderRadius.full },
  copy: { position: 'absolute', left: THUMB + PAD * 2 + 4, right: Spacing.base },
  label: { fontSize: 14, fontWeight: '800' },
  sub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
  thumb: {
    position: 'absolute',
    width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    alignItems: 'center', justifyContent: 'center',
  },
});
