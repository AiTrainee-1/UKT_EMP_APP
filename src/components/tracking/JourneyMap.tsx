import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewHandle } from '../../lib/webview';

import { useTheme } from '../../theme/ThemeProvider';
import { journeyMapHtml } from '../../tracking/journeyHtml';
import type { MapPayload } from '../../tracking/journeyModel';

export interface JourneyMapHandle {
  /** Pans and zooms the map to a place (tapping a stop in the timeline). */
  focus: (lat: number, lng: number) => void;
}

interface Props {
  payload: MapPayload;
  height?: number;
}

/**
 * The journey on a Leaflet + OpenStreetMap map inside a WebView (the HR portal's map stack): the route, numbered stops,
 * dashed "no location" gaps and event markers. If the map library or the tiles cannot load, the page draws the same route on
 * a plain canvas, so this is never a blank box. The map page lives in src/tracking/journeyHtml.ts.
 */
export const JourneyMap = forwardRef<JourneyMapHandle, Props>(function JourneyMap({ payload, height = 320 }, ref) {
  const { C: Colors, isDark } = useTheme();
  const web = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const html = useMemo(() => journeyMapHtml(payload, { dark: isDark }), [payload, isDark]);

  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => {
      web.current?.injectJavaScript(`window.__focus&&window.__focus(${Number(lat)},${Number(lng)});true;`);
    },
  }));

  return (
    <View style={[styles.wrap, { height, borderColor: Colors.border, backgroundColor: Colors.bgSurfaceLow }]}>
      <WebView
        ref={web}
        source={{ html }}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        androidLayerType="hardware"
        overScrollMode="never"
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          if (m === 'ready') setReady(true);
          else if (m === 'ready-fallback') {
            setReady(true);
            setNote('Map tiles could not be loaded. Showing the route only.');
          } else if (m === 'tiles-failed') setNote('Map tiles could not be loaded. Check your internet connection.');
          else if (m.startsWith('error')) setNote('The map could not be drawn.');
        }}
        onError={() => setNote('The map could not be loaded.')}
        onRenderProcessGone={() => setNote('The map stopped. Close and reopen this screen.')}
      />
      {!ready && !note && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={Colors.primary} />
        </View>
      )}
      {!!note && (
        <View style={[styles.note, { backgroundColor: Colors.badgePendingBg }]} pointerEvents="none">
          <Text style={[styles.noteText, { color: Colors.badgePendingText }]}>{note}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  note: { position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  noteText: { fontSize: 11, textAlign: 'center' },
});
