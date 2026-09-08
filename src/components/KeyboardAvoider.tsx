import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  StyleProp,
  ViewStyle,
  type KeyboardEvent,
  type ViewProps,
} from 'react-native';

/**
 * Keeps focused inputs above the on-screen keyboard.
 *
 * Platform split, and the reason for it:
 *
 *  - **Android does nothing here.** The activity already resizes itself when
 *    the keyboard opens (`adjustResize`), so the layout shrinks to the space
 *    above the keyboard on its own — you can see the tab bar come to rest
 *    directly on top of the keyboard. Adding padding on top of that
 *    subtracts the keyboard height a second time, which is what previously
 *    shoved the chat composer to the top of the screen with a large dead gap
 *    beneath it. The correct amount of work to do on Android is none.
 *
 *  - **iOS does need padding.** UIKit does not resize the app window for the
 *    keyboard, so without this the keyboard genuinely covers the input.
 *
 * If a future Android target ever stops resizing (e.g. a switch to
 * `adjustPan`, or an OS change), the fix belongs in the native/app.json
 * windowSoftInputMode config rather than by re-adding padding here — that
 * keeps a single source of truth for how much the layout moves.
 */
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
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

export function KeyboardAvoider({
  children,
  style,
  extraOffset = 0,
  enabled = true,
  pointerEvents,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** iOS only: extra breathing room between the input and the keyboard. */
  extraOffset?: number;
  enabled?: boolean;
  /** Forwarded so overlay hosts (e.g. BottomSheet) can stay click-through. */
  pointerEvents?: ViewProps['pointerEvents'];
}) {
  const pad = useRef(new Animated.Value(0)).current;
  const active = enabled && Platform.OS === 'ios';

  useEffect(() => {
    if (!active) return;

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
  }, [active, extraOffset, pad]);

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[{ flex: 1 }, style, active ? { paddingBottom: pad } : null]}
    >
      {children}
    </Animated.View>
  );
}
