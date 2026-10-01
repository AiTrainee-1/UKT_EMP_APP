import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  StyleProp,
  View,
  ViewStyle,
  type KeyboardEvent,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { coveredBy, keyboardTop, type KeyboardMetrics } from '../lib/keyboardGeometry';

/**
 * Keeps focused inputs above the on-screen keyboard.
 *
 * **Android does not always resize the window for the keyboard.** Expo Go and older builds do
 * (`adjustResize`), so a screen simply gets shorter and everything just works. But an app that
 * targets Android 15+, which is what an exported APK is, is drawn edge to edge, and then the
 * system leaves the window alone: the keyboard slides over the bottom of the screen and covers
 * whatever is there. That is why chat, login and every form worked in Expo Go and not in the APK.
 *
 * So this component does not assume either behaviour. When the keyboard opens it measures where
 * this view actually is and how much of it the keyboard covers, and pads by exactly that:
 *  - window resized by the system: the view is already above the keyboard, nothing is covered, pad 0;
 *  - window not resized: the covered part is the keyboard's height, pad by it.
 * Because it is measured rather than assumed it can never double-count, and it can be nested
 * or combined with the system's own resizing safely. The measurement is repeated once shortly
 * after, in case the system's resize lands after the keyboard event.
 *
 * iOS never resizes the window, so there the padding follows the keyboard's animation directly.
 */

function readMetrics(): KeyboardMetrics | null {
  const m = Keyboard.metrics?.();
  return m && m.height > 0 ? { height: m.height, screenY: m.screenY } : null;
}

/** The keyboard's size and position while it is showing, otherwise null. */
export function useKeyboardMetrics(): KeyboardMetrics | null {
  const [metrics, setMetrics] = useState<KeyboardMetrics | null>(() => (Keyboard.isVisible() ? readMetrics() : null));

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const { height, screenY } = e.endCoordinates;
      setMetrics(height > 0 ? { height, screenY } : null);
    });
    const hide = Keyboard.addListener(hideEvent, () => setMetrics(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return metrics;
}

/** Y (from the top of the window) of the keyboard's top edge while it is showing, otherwise null. */
export function useKeyboardTop(): number | null {
  const metrics = useKeyboardMetrics();
  const navBarInset = useSafeAreaInsets().bottom;
  return metrics ? keyboardTop(metrics, navBarInset, Dimensions.get('screen').height) : null;
}

/**
 * True while the on-screen keyboard is visible.
 *
 * Mainly for centred scroll forms: `justifyContent: 'center'` is right when
 * the form has room, but once the keyboard shrinks the viewport the content
 * becomes taller than the space and centring pushes its top and bottom edges
 * out of reach. Switching to top-alignment while the keyboard is up keeps
 * every field scrollable.
 */
export function useKeyboardVisible(): boolean {
  return useKeyboardMetrics() !== null;
}

interface AvoiderProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** iOS only: extra breathing room between the input and the keyboard. */
  extraOffset?: number;
  enabled?: boolean;
  /** Forwarded so overlay hosts (e.g. BottomSheet) can stay click-through. */
  pointerEvents?: ViewProps['pointerEvents'];
}

function AndroidAvoider({ children, style, enabled = true, pointerEvents }: AvoiderProps) {
  const ref = useRef<View>(null);
  const metrics = useKeyboardMetrics();
  const navBarInset = useSafeAreaInsets().bottom;
  const [pad, setPad] = useState(0);

  const measure = useCallback(() => {
    const view = ref.current;
    if (!view || !enabled || !metrics) {
      setPad(0);
      return;
    }
    const top = keyboardTop(metrics, navBarInset, Dimensions.get('screen').height);
    // The view's own outer edge, which the padding below does not move, so measuring again is stable.
    view.measureInWindow((_x, y, _width, height) => setPad(coveredBy(y + height, top)));
  }, [enabled, metrics, navBarInset]);

  useEffect(() => {
    measure();
    const again = setTimeout(measure, 160);
    return () => clearTimeout(again);
  }, [measure]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={measure}
      pointerEvents={pointerEvents}
      style={[{ flex: 1 }, style, pad > 0 ? { paddingBottom: pad } : null]}
    >
      {children}
    </View>
  );
}

function IosAvoider({ children, style, extraOffset = 0, enabled = true, pointerEvents }: AvoiderProps) {
  const pad = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return;

    // The "Will" pair fires with a duration we can match, so the padding
    // animates in lockstep with the keyboard rather than trailing it.
    const onShow = (e: KeyboardEvent) => {
      Animated.timing(pad, {
        toValue: Math.max(0, (e.endCoordinates?.height ?? 0) + extraOffset),
        duration: e.duration || 220,
        useNativeDriver: false, // padding is not supported by the native driver
      }).start();
    };

    const onHide = (e: KeyboardEvent) => {
      Animated.timing(pad, {
        toValue: 0,
        duration: e?.duration || 180,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener('keyboardWillShow', onShow);
    const hideSub = Keyboard.addListener('keyboardWillHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled, extraOffset, pad]);

  return (
    <Animated.View pointerEvents={pointerEvents} style={[{ flex: 1 }, style, enabled ? { paddingBottom: pad } : null]}>
      {children}
    </Animated.View>
  );
}

export function KeyboardAvoider(props: AvoiderProps) {
  return Platform.OS === 'ios' ? <IosAvoider {...props} /> : <AndroidAvoider {...props} />;
}
