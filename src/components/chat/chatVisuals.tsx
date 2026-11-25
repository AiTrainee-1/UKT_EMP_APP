import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily } from '../../constants/typography';

/** Shared looks for the WhatsApp-style chat (owner 2026-11-25). */

export function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/** A soft, stable colour per colleague so a busy channel is easier to scan. */
export function tintFor(name: string, C: Palette): { bg: string; fg: string } {
  const options = [
    { bg: C.badgeBlueBg, fg: C.badgeBlueText },
    { bg: C.badgeGreenBg, fg: C.badgeGreenText },
    { bg: C.badgeLeaveBg, fg: C.badgeLeaveText },
    { bg: C.clayOrange, fg: C.statusOrange },
    { bg: C.clayBlue, fg: C.categoryTracking },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

/** The chat's colours: own bubbles in the brand colour, everyone else's raised off a soft "wallpaper". */
export function chatColors(C: Palette, isDark: boolean) {
  return {
    wallpaper: isDark ? C.bgLight : C.bgSurfaceLow,
    mine: C.primary,
    onMine: C.onPrimary,
    theirs: isDark ? C.bgSurfaceHigh : C.bgCard,
    hr: C.secondaryFixed,
  };
}

/** The little curved "tail" on the first bubble of a run, WhatsApp-style. */
export function BubbleTail({ side, color }: { side: 'left' | 'right'; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.tail, side === 'right' ? styles.tailRight : styles.tailLeft]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={9} height={13} viewBox="0 0 9 13">
        <Path
          d={side === 'right' ? 'M0 0 H8.4 C7.2 1.4 3.6 6.4 0 12.6 Z' : 'M9 0 H0.6 C1.8 1.4 5.4 6.4 9 12.6 Z'}
          fill={color}
        />
      </Svg>
    </View>
  );
}

export function ChatAvatar({ name, isHr, size = 28 }: { name: string; isHr: boolean; size?: number }) {
  const { C } = useTheme();
  const tint = tintFor(name || '?', C);
  if (isHr) {
    return (
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: C.secondaryContainer }]}>
        <MaterialCommunityIcons name="shield-account" size={size * 0.54} color={C.onSecondaryContainer} />
      </View>
    );
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg }]}>
      <Text style={[styles.avatarText, { color: tint.fg, fontSize: size * 0.37 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tail: { position: 'absolute', top: 0, width: 9, height: 13 },
  tailRight: { right: -7 },
  tailLeft: { left: -7 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FontFamily.bodySemibold },
});
