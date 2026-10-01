import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { ScrollView, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';
import { scrollToReveal } from '../lib/keyboardGeometry';
import { useKeyboardTop } from './KeyboardAvoider';

/**
 * A ScrollView for screens with inputs. When the keyboard opens it checks whether the field being
 * typed in ended up underneath it and, if so, scrolls just far enough to bring it back into view,
 * so what you type is always visible.
 *
 * It only ever scrolls when the field really is covered, so it does nothing on top of the scrolling
 * Android already does when the window is resized. Taps on buttons keep working with the keyboard up.
 */
export const FormScrollView = forwardRef<ScrollView, ScrollViewProps>(function FormScrollView(
  { onScroll, scrollEventThrottle = 16, keyboardShouldPersistTaps = 'handled', ...props },
  forwardedRef,
) {
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const top = useKeyboardTop();

  useImperativeHandle(forwardedRef, () => scroll.current as ScrollView);

  useEffect(() => {
    if (top === null) return;
    // Give KeyboardAvoider a moment to lift the screen first, then look at where the field ended up.
    const timer = setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput?.();
      if (!input || !scroll.current) return;
      input.measureInWindow((_x, y, _width, height) => {
        const by = scrollToReveal(y + height, top);
        if (by > 0) scroll.current?.scrollTo({ y: offset.current + by, animated: true });
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [top]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return (
    <ScrollView
      ref={scroll}
      onScroll={handleScroll}
      scrollEventThrottle={scrollEventThrottle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
});
