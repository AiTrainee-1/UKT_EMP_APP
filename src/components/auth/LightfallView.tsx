import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, StyleSheet, View } from 'react-native';
import { WebView, type WebViewHandle } from '../../lib/webview';
import { useNavigation } from 'expo-router';
import * as Device from 'expo-device';

import { useKeyboardVisible } from '../KeyboardAvoider';

import { lightfallHtml } from './lightfallHtml';

// Built once: the page is ~55 KB of script, no reason to rebuild the string on every render.
const HTML = lightfallHtml();

/**
 * The Lightfall WebGL animation behind the login header, drawn by a transparent-looking WebView (the page paints its own
 * gradient). Purely decorative: it never takes a touch, it fades in only once WebGL is running (until then, or if the phone
 * cannot run WebGL, the screen's own gradient shows), and it freezes while this screen is not in front or the app is in
 * the background, so it costs no battery then.
 */
/**
 * Phones with less memory than this get the plain gradient (2026-11-25): on 2-3 GB Redmi / Infinix phones the WebGL page
 * and the keyboard together are enough for Android to kill and restart the keyboard, which then flickers open and shut.
 */
const MIN_MEMORY_BYTES = 4 * 1024 ** 3;
const LOW_MEMORY = typeof Device.totalMemory === 'number' && Device.totalMemory > 0 && Device.totalMemory < MIN_MEMORY_BYTES;

export default function LightfallView() {
  // Not while the keyboard is up (2026-11-25): an Android WebView can take the input focus from the field being typed in
  // (the keyboard then closes), and the animation is hidden behind the form then anyway. It comes back when the keyboard
  // goes.
  const keyboardVisible = useKeyboardVisible();
  if (LOW_MEMORY || keyboardVisible) return null;
  return <LightfallWeb />;
}

function LightfallWeb() {
  const ref = useRef<WebViewHandle>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    let focused = true;
    let foreground = AppState.currentState === 'active';
    const apply = () => {
      ref.current?.injectJavaScript(`window.__lightfallPause&&window.__lightfallPause(${!(focused && foreground)});true;`);
    };
    const sub = AppState.addEventListener('change', (s) => {
      foreground = s === 'active';
      apply();
    });
    const onFocus = navigation.addListener('focus', () => {
      focused = true;
      apply();
    });
    const onBlur = navigation.addListener('blur', () => {
      focused = false;
      apply();
    });
    return () => {
      sub.remove();
      onFocus();
      onBlur();
    };
  }, [navigation]);

  if (failed) return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <WebView
        ref={ref}
        source={{ html: HTML }}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // never takes the input focus from the sign-in fields (2026-11-25)
        focusable={false}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        onMessage={(e) => {
          const msg = e.nativeEvent.data;
          if (msg === 'ready') Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
          else if (msg.startsWith('error')) setFailed(true);
        }}
        onError={() => setFailed(true)}
        onRenderProcessGone={() => setFailed(true)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
