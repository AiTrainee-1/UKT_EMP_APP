import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { createFontStyles, SKIN } from './aboutSkin';

/** Opens a web / maps link; a phone with no browser gets a friendly message instead of an error. */
export async function openWebLink(url: string, what: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Could not open ${what}`, `Please open ${url.replace(/^https?:\/\//, '')} in your browser.`);
  }
}

/** What a block of the page is painted in; decides every text colour on it. */
export type Surface = 'dark' | 'cream' | 'royal' | 'butter';

export const SURFACE: Record<Surface, { text: string; muted: string; accent: string; hair: string }> = {
  dark: { text: SKIN.cream, muted: SKIN.mutedOnDark, accent: SKIN.butter, hair: SKIN.hairDark },
  cream: { text: SKIN.ink, muted: SKIN.inkMuted, accent: SKIN.crimson, hair: SKIN.hairCream },
  royal: { text: SKIN.cream, muted: 'rgba(252,240,214,0.84)', accent: SKIN.butter, hair: 'rgba(252,240,214,0.22)' },
  butter: { text: SKIN.ink, muted: SKIN.inkMuted, accent: SKIN.crimson, hair: SKIN.hairCream },
};

const useStyles = createFontStyles((f) =>
  StyleSheet.create({
    eyebrow: { fontFamily: f.mono, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
    heading: { fontFamily: f.display, letterSpacing: -0.8 },
    accent: { ...f.serifItalic, letterSpacing: -0.2 },
    para: { fontFamily: f.body, fontSize: 15, lineHeight: 24 },
    pill: {
      minHeight: 50,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 20,
      paddingRight: 6,
      paddingVertical: 6,
    },
    pillOutline: { borderWidth: 1.5, paddingRight: 16 },
    pillLabel: { fontFamily: f.bodySemi, fontSize: 15, flexShrink: 1 },
    pillBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    chip: {
      minHeight: 40,
      borderRadius: 999,
      borderWidth: 1.25,
      paddingHorizontal: 14,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chipText: { fontFamily: f.bodySemi, fontSize: 13.5 },
  }),
);

/** "— ABOUT US": the mono, uppercase section label with a leading dash (decorative: the heading says it). */
export function Eyebrow({ children, surface = 'dark', color }: { children: string; surface?: Surface; color?: string }) {
  const s = useStyles();
  return (
    <Text
      style={[s.eyebrow, { color: color ?? SURFACE[surface].accent }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {`— ${children}`}
    </Text>
  );
}

/**
 * A heavy display heading with one italic serif accent phrase, e.g.
 * "Garments made *with care* in Tirupur." Read out as a single header.
 */
export function Heading({
  lead,
  accent,
  tail = '',
  surface = 'dark',
  size = 34,
  accentColor,
  style,
}: {
  lead: string;
  accent: string;
  tail?: string;
  surface?: Surface;
  size?: number;
  accentColor?: string;
  style?: StyleProp<TextStyle>;
}) {
  const s = useStyles();
  const c = SURFACE[surface];
  const lineHeight = Math.round(size * 1.1);
  return (
    <Text accessibilityRole="header" style={[s.heading, { color: c.text, fontSize: size, lineHeight }, style]}>
      {lead}
      {/* The serif reads smaller than the grotesque at the same size, so it is set a little larger. */}
      <Text style={[s.accent, { color: accentColor ?? c.accent, fontSize: Math.round(size * 1.12), lineHeight }]}>{accent}</Text>
      {tail}
    </Text>
  );
}

export function Para({
  children,
  surface = 'dark',
  style,
  lead = false,
}: {
  children: React.ReactNode;
  surface?: Surface;
  style?: StyleProp<TextStyle>;
  /** The first, larger paragraph of a block. */
  lead?: boolean;
}) {
  const s = useStyles();
  const c = SURFACE[surface];
  return (
    <Text style={[s.para, { color: lead ? c.text : c.muted }, lead && { fontSize: 17, lineHeight: 26 }, style]}>{children}</Text>
  );
}

/**
 * The demo sites' buttons: a butter pill (an ink one on light blocks) with a round arrow badge,
 * or an outlined pill. At least 50 px tall.
 */
export function Pill({
  label,
  onPress,
  accessibilityLabel,
  variant = 'solid',
  surface = 'dark',
  icon = 'arrow-top-right',
  leadingIcon,
  role = 'button',
  spread = false,
  style,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'solid' | 'outline';
  surface?: Surface;
  icon?: string;
  leadingIcon?: string;
  role?: 'button' | 'link';
  /** Full-width pill: the badge / arrow sits at the right edge. */
  spread?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const onLight = surface === 'cream' || surface === 'butter';
  const solidBg = onLight ? SKIN.ink : SKIN.butter;
  const solidText = onLight ? SKIN.cream : SKIN.ink;
  const badgeBg = onLight ? SKIN.butter : SKIN.ink;
  const badgeIcon = onLight ? SKIN.ink : SKIN.butter;
  const outlineColor = SURFACE[surface].text;
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        s.pill,
        solid ? { backgroundColor: solidBg } : [s.pillOutline, { borderColor: outlineColor }],
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {!!leadingIcon && <MaterialCommunityIcons name={leadingIcon as any} size={19} color={solid ? solidText : outlineColor} />}
      <Text style={[s.pillLabel, { color: solid ? solidText : outlineColor }]} numberOfLines={1}>
        {label}
      </Text>
      {spread && <View style={{ flex: 1 }} />}
      {solid ? (
        <View style={[s.pillBadge, { backgroundColor: badgeBg }]}>
          <MaterialCommunityIcons name={icon as any} size={19} color={badgeIcon} />
        </View>
      ) : (
        <MaterialCommunityIcons name={icon as any} size={18} color={outlineColor} />
      )}
    </Pressable>
  );
}

/** A rounded outline chip (group companies, certificates). */
export function Chip({
  label,
  surface = 'dark',
  filled = false,
  leading,
}: {
  label: string;
  surface?: Surface;
  filled?: boolean;
  leading?: React.ReactNode;
}) {
  const s = useStyles();
  const c = SURFACE[surface];
  const filledText = surface === 'dark' || surface === 'royal' ? SKIN.ink : SKIN.cream;
  return (
    <View
      style={[
        s.chip,
        { borderColor: surface === 'dark' ? 'rgba(252,240,214,0.3)' : c.text },
        filled && { backgroundColor: c.text, borderColor: c.text },
      ]}
    >
      {leading}
      <Text style={[s.chipText, { color: filled ? filledText : c.text }]}>{label}</Text>
    </View>
  );
}
