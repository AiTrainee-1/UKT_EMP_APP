import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, LayoutAnimation, UIManager } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ExpandableCardProps {
  icon: string;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  badgeBg?: string;
  badgeColor?: string;
  rightIcon?: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export function ExpandableCard({
  icon, iconBg, iconColor, title, subtitle,
  badgeLabel, badgeBg, badgeColor, rightIcon,
  defaultOpen = false, children,
}: ExpandableCardProps) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.8}>
        <View style={[styles.iconWrap, iconBg ? { backgroundColor: iconBg } : null]}>
          <MaterialCommunityIcons name={icon as any} size={18} color={iconColor ?? Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {!!badgeLabel && (
          <View style={[styles.badge, badgeBg ? { backgroundColor: badgeBg } : null]}>
            <Text style={[styles.badgeText, badgeColor ? { color: badgeColor } : null]}>{badgeLabel}</Text>
          </View>
        )}
        {!!rightIcon && (
          <MaterialCommunityIcons name={rightIcon as any} size={16} color={Colors.textMuted} style={{ marginLeft: 6 }} />
        )}
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.outline}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

// A grey rounded field box — the mockup's building block for Personal
// Details / Employment / Bank rows, used either two-up (`DetailRow`) or
// full-width with an optional right-side accessory (call button, badge).
export function DetailBox({
  label, value, flex = 1, accessory,
}: { label: string; value: React.ReactNode; flex?: number; accessory?: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.detailBox, { flex }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={2}>{value ?? '—'}</Text>
      </View>
      {accessory}
    </View>
  );
}

export function DetailRow({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.detailRow}>{children}</View>;
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 15 },
  subtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  badge: {
    backgroundColor: Colors.badgeLeaveBg,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: Colors.badgeLeaveText, fontSize: 11, fontWeight: '700' },

  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    padding: 12,
    gap: 8,
  },
  detailRow: { flexDirection: 'row', gap: 8 },
  detailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.md,
    padding: 10,
    gap: 8,
  },
  detailLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '600', marginBottom: 2 },
  detailValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: FontFamily.bodySemibold },
});
