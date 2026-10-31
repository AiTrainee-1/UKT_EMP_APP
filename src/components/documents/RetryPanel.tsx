import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * "Couldn't load - Try again" panel. Kept visibly different from an empty state (red-tinted
 * icon, a retry button) so a network failure is never mistaken for "you have nothing here".
 * Generic: used by the Documents, Team Chat and ID Card screens.
 */
export function RetryPanel({
  title = 'Couldn’t load this',
  message = 'Check your internet connection and try again.',
  icon = 'cloud-off-outline',
  onRetry,
  retrying = false,
  compact = false,
}: {
  title?: string;
  message?: string;
  icon?: string;
  onRetry: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]} accessibilityLiveRegion="polite">
      <MotiView
        from={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 160 }}
        style={styles.iconWrap}
      >
        <MaterialCommunityIcons name={icon as any} size={34} color={C.statusRed} />
      </MotiView>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        accessibilityState={{ busy: retrying, disabled: retrying }}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, retrying && { opacity: 0.7 }]}
      >
        {retrying ? (
          <ActivityIndicator size="small" color={C.onPrimary} />
        ) : (
          <MaterialCommunityIcons name="refresh" size={17} color={C.onPrimary} />
        )}
        <Text style={styles.buttonText}>{retrying ? 'Trying…' : 'Try again'}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    wrapCompact: { flex: 0, paddingVertical: 28 },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.badgeRedBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    title: { fontFamily: FontFamily.displayBold, fontSize: 17, color: C.textPrimary, textAlign: 'center' },
    message: { fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 20, color: C.textMuted, textAlign: 'center', maxWidth: 300 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 22,
      paddingVertical: 11,
      marginTop: 8,
      minHeight: 44,
    },
    buttonText: { fontFamily: FontFamily.bodySemibold, fontSize: 14, color: C.onPrimary },
  });
