import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

export interface ChannelOption {
  key: 'company' | 'department';
  label: string;
  icon: string;
  /** Shown under the label for a screen reader, e.g. "not available". */
  note?: string;
}

/** Company / Department segmented control with a sliding highlight. */
export function ChannelSwitcher({
  options,
  value,
  onChange,
  reduceMotion,
}: {
  options: ChannelOption[];
  value: ChannelOption['key'];
  onChange: (k: ChannelOption['key']) => void;
  reduceMotion: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  // Inner width = layout width minus the 1 px border and 4 px padding on each side.
  const segW = options.length ? (width - 10) / options.length : 0;

  return (
    <View
      style={styles.track}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {width > 0 && (
        <MotiView
          animate={{ translateX: index * segW }}
          transition={reduceMotion ? { type: 'timing', duration: 0 } : { type: 'spring', damping: 20, stiffness: 240 }}
          style={[styles.thumb, { width: segW }]}
        />
      )}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${o.label} chat${o.note ? `, ${o.note}` : ''}`}
            style={styles.segment}
          >
            <MaterialCommunityIcons name={o.icon as any} size={15} color={active ? C.onPrimary : C.textMuted} />
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: C.bgSurfaceLow,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: C.border,
      padding: 4,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
    },
    thumb: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: BorderRadius.full,
      backgroundColor: C.primary,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 8,
      minHeight: 40,
    },
    label: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: C.textMuted, flexShrink: 1 },
    labelActive: { color: C.onPrimary },
  });
