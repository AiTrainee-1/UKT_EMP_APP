import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { journeyMapHtml } from '../../tracking/journeyHtml';
import type { MapPayload } from '../../tracking/journeyModel';

export interface JourneyMapHandle {
  focus: (lat: number, lng: number) => void;
}

interface Props {
  payload: MapPayload;
  height?: number;
}

/** Browser preview of the app: the same map page in an iframe (the phone builds use JourneyMap.tsx's WebView). */
export const JourneyMap = forwardRef<JourneyMapHandle, Props>(function JourneyMap({ payload, height = 320 }, ref) {
  const { C: Colors, isDark } = useTheme();
  const frame = useRef<any>(null);
  const html = useMemo(() => journeyMapHtml(payload, { dark: isDark }), [payload, isDark]);
  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => {
      try {
        frame.current?.contentWindow?.__focus?.(lat, lng);
      } catch {
        // cross-origin sandbox: ignore
      }
    },
  }));
  return (
    <View style={[styles.wrap, { height, borderColor: Colors.border }]}>
      {React.createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: 'Journey map',
        sandbox: 'allow-scripts allow-same-origin',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
});
