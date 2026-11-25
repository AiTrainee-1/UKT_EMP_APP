import React, { useEffect, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useReduceMotion } from '../../lib/motionPrefs';

/*
 * The pieces the Profile page is built from (owner 2026-11-25 redesign): a section card (optionally collapsible), label /
 * value rows, quick stat chips and settings rows. Themed for light and dark; motion follows Reduce Motion.
 */

export interface Badge {
  label: string;
  bg: string;
  fg: string;
}

export function SectionCard({
  icon,
  title,
  subtitle,
  badge,
  rightIcon,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: Badge;
  rightIcon?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.value = reduce ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: 200 });
  }, [open, reduce, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  const toggle = () => {
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setOpen((v) => !v);
  };

  const head = (
    <View style={styles.head}>
      <View style={styles.headIcon}>
        <MaterialCommunityIcons name={icon as any} size={18} color={C.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {!!badge && (
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
        </View>
      )}
      {!!rightIcon && <MaterialCommunityIcons name={rightIcon as any} size={15} color={C.textMuted} />}
      {collapsible && (
        <Animated.View style={chevron}>
          <MaterialCommunityIcons name="chevron-down" size={20} color={C.textMuted} />
        </Animated.View>
      )}
    </View>
  );

  return (
    <View style={styles.card}>
      {collapsible ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          {head}
        </Pressable>
      ) : (
        head
      )}
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

/** One label / value line; "—" when there is no value. */
export function InfoRow({
  icon,
  label,
  value,
  accessory,
  last = false,
}: {
  icon?: string;
  label: string;
  value?: string | null;
  accessory?: React.ReactNode;
  last?: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const shown = value != null && String(value).trim() !== '' ? String(value) : '—';
  return (
    <View style={[styles.row, !last && styles.rowDivider]} accessible accessibilityLabel={`${label}: ${shown}`}>
      {!!icon && <MaterialCommunityIcons name={icon as any} size={17} color={C.textMuted} style={styles.rowIcon} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, shown === '—' && styles.rowValueEmpty]} selectable>
          {shown}
        </Text>
      </View>
      {accessory}
    </View>
  );
}

/** Two short values side by side (Gender | Blood group). */
export function InfoPair({
  left,
  right,
  last = false,
}: {
  left: { icon?: string; label: string; value?: string | null };
  right: { icon?: string; label: string; value?: string | null };
  last?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.pair, !last && styles.rowDivider]}>
      <View style={{ flex: 1 }}>
        <InfoRow {...left} last />
      </View>
      <View style={styles.pairGap} />
      <View style={{ flex: 1 }}>
        <InfoRow {...right} last />
      </View>
    </View>
  );
}

/** A small round action at the end of a row (call, etc.). Text / icon on the primary fill wear onPrimary. */
export function RowAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon as any} size={15} color={C.onPrimary} />
    </Pressable>
  );
}

export function StatChip({ icon, label, value, tint }: { icon: string; label: string; value: string; tint?: string }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.chip} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.chipIcon}>
        <MaterialCommunityIcons name={icon as any} size={15} color={tint ?? C.primaryLight} />
      </View>
      <View>
        <Text style={styles.chipLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.chipValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  sub,
  onPress,
  right,
  tint,
  tintBg,
  last = false,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tint?: string;
  tintBg?: string;
  last?: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const inner = (
    <>
      <View style={[styles.setIcon, { backgroundColor: tintBg ?? C.primaryFixed }]}>
        <MaterialCommunityIcons name={icon as any} size={19} color={tint ?? C.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.setLabel}>{label}</Text>
        {!!sub && <Text style={styles.setSub}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={C.outline} /> : null)}
    </>
  );
  return (
    <View style={!last && styles.setDivider}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.setRow, pressed && { backgroundColor: C.bgSurfaceLow }]}
          accessibilityRole="button"
          accessibilityLabel={sub ? `${label}. ${sub}` : label}
        >
          {inner}
        </Pressable>
      ) : (
        <View style={styles.setRow}>{inner}</View>
      )}
    </View>
  );
}

export const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
  android: { elevation: 1 },
});

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xxl,
      borderWidth: 1,
      borderColor: C.border,
      marginHorizontal: 16,
      marginBottom: 12,
      overflow: 'hidden',
      ...cardShadow,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    headIcon: {
      width: 36, height: 36, borderRadius: 12,
      backgroundColor: C.primaryFixed,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    subtitle: { color: C.textMuted, fontSize: 11.5, marginTop: 1 },
    badge: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
    badgeText: { fontSize: 10.5, fontWeight: '800' },
    body: { paddingHorizontal: 16, paddingBottom: 6, borderTopWidth: 1, borderTopColor: C.border },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outlineVariant },
    rowIcon: { width: 20, textAlign: 'center' },
    rowLabel: { color: C.textMuted, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.1 },
    rowValue: { color: C.textPrimary, fontSize: 14, fontFamily: FontFamily.bodySemibold, marginTop: 2 },
    rowValueEmpty: { color: C.textMuted, fontFamily: FontFamily.bodyRegular },
    pair: { flexDirection: 'row' },
    pairGap: { width: 12 },
    rowAction: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center',
    },

    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 10,
      paddingLeft: 10,
      paddingRight: 14,
      ...cardShadow,
    },
    chipIcon: {
      width: 30, height: 30, borderRadius: 10,
      backgroundColor: C.bgSurfaceLow,
      alignItems: 'center', justifyContent: 'center',
    },
    chipLabel: { color: C.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3, maxWidth: 170 },
    chipValue: { color: C.textPrimary, fontSize: 13, fontFamily: FontFamily.bodySemibold, marginTop: 1, maxWidth: 170 },

    setRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
    setDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outlineVariant, marginLeft: 0 },
    setIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    setLabel: { color: C.textPrimary, fontSize: 14.5, fontFamily: FontFamily.bodySemibold },
    setSub: { color: C.textMuted, fontSize: 11.5, marginTop: 1 },
  });
