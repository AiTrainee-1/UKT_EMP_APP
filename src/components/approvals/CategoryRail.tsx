import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { ApprovalCategory } from '../../lib/approvalsHistory';
import { categoryMeta } from './categoryMeta';

/**
 * The categories this head can decide, as a row of pills: icon, name and how many requests in it wait for them. The
 * chosen pill fills with the category's colour.
 */
export function CategoryRail({
  categories,
  value,
  counts,
  onChange,
}: {
  categories: ApprovalCategory[];
  value: ApprovalCategory;
  /** Pending per category (a category left out shows no badge). */
  counts: Partial<Record<ApprovalCategory, { pending?: number }>>;
  onChange: (c: ApprovalCategory) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta = categoryMeta(Colors);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {categories.map((c) => {
        const m = meta[c];
        const active = c === value;
        const pending = counts[c]?.pending ?? 0;
        return (
          <TouchableOpacity
            key={c}
            onPress={() => onChange(c)}
            activeOpacity={0.85}
            style={[styles.pill, active && { backgroundColor: m.color, borderColor: m.color }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${m.label}, ${pending} waiting for you`}
            testID={`approvals-category-${c}`}
          >
            <View style={[styles.icon, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : m.bg }]}>
              <MaterialCommunityIcons name={m.icon as any} size={15} color={active ? '#fff' : m.color} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {m.label}
            </Text>
            {pending > 0 && (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && { color: m.color }]}>{pending > 99 ? '99+' : pending}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    rail: { flexGrow: 0 },
    content: { paddingHorizontal: 16, gap: 8, paddingVertical: 2 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingLeft: 5,
      paddingRight: 12,
      paddingVertical: 5,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.bgCard,
      borderWidth: 1,
      borderColor: Colors.outlineVariant,
    },
    icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    label: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    labelActive: { color: '#fff' },
    badge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 10,
      backgroundColor: Colors.statusRed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeActive: { backgroundColor: '#fff' },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  });
