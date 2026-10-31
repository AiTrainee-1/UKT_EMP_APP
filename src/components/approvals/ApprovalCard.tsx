import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { Badge } from '../ui/Badge';
import { DecisionBadge, WaitingChip } from '../approval/ApprovalTrail';
import { hodCanAct, hodCanReject } from '../../lib/approval';
import {
  normalizeOutcome,
  outcomeLine,
  waitTone,
  waitingFor,
  type ApprovalCategory,
  type ApprovalStatus,
} from '../../lib/approvalsHistory';
import {
  empCode,
  empDepartment,
  empInitial,
  empName,
  itemBadge,
  itemDateLabel,
  itemTypeLabel,
  onDutyPunchLine,
} from '../../lib/approvalsItems';
import { categoryMeta } from './categoryMeta';
import { TrailStrip } from './TrailStrip';
import type { ApprovalItem } from './types';

/**
 * One request in a list: who, what and when, how long it has waited (Pending) or who decided it (Approved / Rejected),
 * its approval path, the reason, and - on Pending - Approve / Reject, which open the decision sheet as before.
 */
export function ApprovalCard({
  category,
  status,
  item,
  onOpen,
  now,
}: {
  category: ApprovalCategory;
  status: ApprovalStatus;
  item: ApprovalItem;
  onOpen: () => void;
  now: Date;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta = categoryMeta(Colors)[category];
  const badge = itemBadge(category, status, item);
  const name = empName(item);
  const dept = empDepartment(item);
  const pending = status === 'pending';
  const canApprove = pending && hodCanAct(item.approval);
  const canReject = pending && hodCanReject(item.approval);
  const outcome = normalizeOutcome(item.outcome);
  const line = outcomeLine(outcome);
  const punchLine = category === 'onDuty' ? onDutyPunchLine(item) : null;

  const waited = pending ? waitingFor(item.createdAt, now) : null;
  const tone = waitTone(item.createdAt, now);
  const waitColors =
    tone === 'old'
      ? { fg: Colors.badgeRedText, bg: Colors.badgeRedBg }
      : tone === 'aging'
        ? { fg: Colors.badgeYellowText, bg: Colors.badgeYellowBg }
        : { fg: Colors.textSecondary, bg: Colors.bgSurfaceLow };

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: meta.color }]}
      onPress={onOpen}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${itemTypeLabel(category, item)}, ${badge.label}`}
      accessibilityHint="Opens the request"
      testID={`approval-card-${item.id}`}
    >
      <View style={styles.top}>
        <View style={styles.who}>
          <LinearGradient
            colors={category === 'resignation' ? (['#C62828', '#E11D48'] as const) : Colors.gradientPrimary}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{empInitial(item)}</Text>
          </LinearGradient>
          <View style={styles.whoText}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.code} numberOfLines={1}>
              {empCode(item)}
              {dept ? ` · ${dept}` : ''}
            </Text>
          </View>
        </View>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      <View style={styles.what}>
        <View style={[styles.typeChip, { backgroundColor: meta.bg }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[styles.typeText, { color: meta.color }]} numberOfLines={1}>
            {itemTypeLabel(category, item)}
          </Text>
        </View>
        <View style={styles.when}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.whenText} numberOfLines={1}>{itemDateLabel(category, item)}</Text>
        </View>
        {!!punchLine && (
          <View style={styles.when}>
            <MaterialCommunityIcons name="map-marker-check-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.whenText} numberOfLines={1}>{punchLine}</Text>
          </View>
        )}
      </View>

      {pending ? (
        <View style={styles.chips}>
          {!!waited && (
            <View style={[styles.waitChip, { backgroundColor: waitColors.bg }]}>
              <MaterialCommunityIcons name="timer-sand" size={12} color={waitColors.fg} />
              <Text style={[styles.waitText, { color: waitColors.fg }]}>{waited}</Text>
            </View>
          )}
          <WaitingChip approval={item.approval} />
        </View>
      ) : (
        // Who decided it, prominently: "Approved by HR (Meena) · 31 Oct, 10:05 AM" / "Rejected by you".
        !!line && (
          <DecisionBadge
            decider={line.decider}
            note={line.note}
            tone={line.tone === 'waiting' ? 'waiting' : undefined}
            testID={`approval-decider-${item.id}`}
          />
        )
      )}

      <TrailStrip approval={item.approval} />

      {!!item.reason && (
        <Text style={styles.reason} numberOfLines={2}>
          "{item.reason}"
        </Text>
      )}

      {(canApprove || canReject) && (
        <View style={styles.actions}>
          {canApprove && (
            <TouchableOpacity style={[styles.actionBtn, styles.approve]} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Approve ${name}'s request`}>
              <MaterialCommunityIcons name="check" size={15} color={Colors.statusGreen} />
              <Text style={[styles.actionText, { color: Colors.statusGreen }]}>Approve</Text>
            </TouchableOpacity>
          )}
          {canReject && (
            <TouchableOpacity style={[styles.actionBtn, styles.reject]} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Reject ${name}'s request`}>
              <MaterialCommunityIcons name="close" size={15} color={Colors.statusRed} />
              <Text style={[styles.actionText, { color: Colors.statusRed }]}>Reject</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      borderLeftWidth: 4,
      padding: 14,
      gap: 10,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
        android: { elevation: 1 },
      }),
    },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    who: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    whoText: { flex: 1 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontFamily: FontFamily.headlineSemibold, fontSize: 16 },
    name: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
    code: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

    what: { gap: 6 },
    typeChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      maxWidth: '100%',
    },
    typeText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
    when: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    whenText: { color: Colors.textSecondary, fontSize: 12.5, flexShrink: 1 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    waitChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    waitText: { fontSize: 11.5, fontWeight: '700' },

    reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic' },

    actions: { flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 9,
      borderRadius: BorderRadius.lg,
    },
    approve: { backgroundColor: Colors.badgeGreenBg },
    reject: { backgroundColor: Colors.badgeRedBg },
    actionText: { fontSize: 12.5, fontWeight: '800' },
  });
