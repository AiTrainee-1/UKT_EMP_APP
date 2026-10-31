import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/** A list that could not be loaded says so, with Try again: a failed request must never look like "nothing here". */
export function LoadError({
  title = 'Could not load this',
  message = 'Check your internet connection and try again.',
  onRetry,
  busy = false,
  testID,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
  busy?: boolean;
  testID?: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.box} testID={testID} accessibilityRole="alert">
      <MaterialCommunityIcons name="cloud-alert-outline" size={22} color={Colors.statusRed} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.msg}>{message}</Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        disabled={busy}
        style={[styles.btn, busy && { opacity: 0.5 }]}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
        <Text style={styles.btnText}>{busy ? 'Trying…' : 'Try again'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Colors.badgeRedBg,
      borderRadius: BorderRadius.lg,
      padding: 12,
      marginBottom: 12,
    },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    msg: { color: Colors.textSecondary, fontSize: 11.5, marginTop: 2 },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Colors.statusRed,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    btnText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  });
