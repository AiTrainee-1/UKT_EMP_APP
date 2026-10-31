import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/** Opens a web / maps link; a phone with no browser gets a friendly message instead of an error. */
export async function openWebLink(url: string, what: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Could not open ${what}`, `Please open ${url.replace(/^https?:\/\//, '')} in your browser.`);
  }
}

/** Section title with an icon and an optional hint on the right. */
export function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionLeft}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon as any} size={16} color={C.primary} />
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      </View>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
    </View>
  );
}

/** A big tappable contact row: icon, what it does, the number / address it uses. */
export function ContactRow({
  icon,
  title,
  value,
  onPress,
  accessibilityLabel,
  tone = 'plain',
  link = false,
}: {
  icon: string;
  title: string;
  value: string;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'primary' | 'plain';
  /** Opens a web page (read out as a link rather than a button). */
  link?: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const primary = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={link ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.contactRow, primary && styles.contactRowPrimary, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.contactIcon, primary && styles.contactIconPrimary]}>
        <MaterialCommunityIcons name={icon as any} size={19} color={primary ? C.onPrimary : C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.contactTitle, primary && { color: C.onPrimary }]}>{title}</Text>
        <Text style={[styles.contactValue, primary && { color: C.onPrimary, opacity: 0.85 }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={primary ? C.onPrimary : C.textMuted} />
    </Pressable>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 22,
      marginBottom: 10,
      marginHorizontal: 16,
    },
    sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: C.badgeBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16.5, letterSpacing: -0.2 },
    sectionHint: { color: C.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 11 },

    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: BorderRadius.lg,
      backgroundColor: C.bgSurfaceLow,
      borderWidth: 1,
      borderColor: C.border,
      minHeight: 60,
    },
    contactRowPrimary: { backgroundColor: C.primary, borderColor: C.primary },
    contactIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactIconPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
    contactTitle: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    contactValue: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, marginTop: 1 },
  });
