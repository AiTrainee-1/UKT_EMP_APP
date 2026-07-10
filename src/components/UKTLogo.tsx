import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface UKTLogoProps {
  size?: number;
}

/**
 * Reproduces the UKTextiles blue oval logo (UKT letters on sky-blue ellipse).
 * width:height ratio mirrors the actual logo (roughly 4:3).
 */
export function UKTLogo({ size = 80 }: UKTLogoProps) {
  const w = size * 1.35;
  const h = size;
  const br = h / 2;
  const borderW = size * 0.025;
  const gap = size * 0.045;

  return (
    <View
      style={[
        styles.shadow,
        {
          width: w,
          height: h,
          borderRadius: br,
        },
      ]}
    >
      {/* Outer blue oval */}
      <View
        style={{
          width: w,
          height: h,
          borderRadius: br,
          backgroundColor: '#43bef0',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Inner white oval border (double-ring effect) */}
        <View
          style={{
            position: 'absolute',
            width: w - gap * 2,
            height: h - gap * 2,
            borderRadius: (h - gap * 2) / 2,
            borderWidth: borderW,
            borderColor: 'rgba(255,255,255,0.9)',
          }}
        />

        {/* UKT lettering */}
        <Text
          style={{
            color: '#ffffff',
            fontSize: size * 0.42,
            fontWeight: '900',
            letterSpacing: size * 0.01,
            includeFontPadding: false,
          }}
        >
          UKT
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#006496',
        shadowOffset: { width: 4, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
});
