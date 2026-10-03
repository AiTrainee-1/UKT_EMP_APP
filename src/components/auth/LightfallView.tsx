import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from 'expo-router';

import { lightfallHtml } from './lightfallHtml';

// Built once: the page is ~55 KB of script, no reason to rebuild the string on every render.
const HTML = lightfallHtml();

/**
 * The Lightfall WebGL animation behind the login header, drawn by a transparent-looking WebView (the page paints its own
 * gradient). Purely decorative: it never takes a touch, it fades in only once WebGL is running (until then, or if the phone
 * cannot run WebGL, the screen's own gradient shows), and it freezes while this screen is not in front or the app is in
 * the background, so it costs no battery then.
 */
export default function LightfallView() {
  const ref = useRef<WebView>(null);
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
