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
  itemTypeLabel,
  onDutyPunchLine,
} from '../../lib/approvalsItems';
import { raisedByLabel, readRaisedByRole, type ClaimLike } from '../../lib/compensation';
import { categoryMeta } from './categoryMeta';
import { TrailStrip } from './TrailStrip';
import { RequestTiming } from './RequestTiming';
import type { ApprovalItem } from './types';

/**
 * One request in a list: who, what and when, how long it has waited (Pending) or who decided it (Approved / Rejected),
 * its approval path, the reason, and - on Pending - Approve / Reject, which open the decision sheet as before.
 * Owner 2026-11-25: the list mixes every status (Pending first), so `status` is this row's own; a pending row is
 * highlighted, and every row shows the day(s) it is for, when it was submitted and how far ahead ("Applied 3 days
 * before", RequestTiming). Tapping anywhere opens the request to approve or reject it there.
 */
export function ApprovalCard({
  category,
  status,
  item,
  onOpen,
  now,
}: {
  category: ApprovalCategory;
  /** This row's own status (the list holds all three). */
  status: ApprovalStatus;
  item: ApprovalItem;
  /** Opens the decision sheet; 'reject' (the card's Reject) opens it asking for the reason for rejecting. */
  onOpen: (intent?: 'reject') => void;
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
  // Compensation: who raised the claim (the employee themselves, or HR for them). An older backend's claims were HR's.
  const raisedBy = category === 'holidayWork' ? raisedByLabel(item as ClaimLike) : null;
  const raisedByEmployee = category === 'holidayWork' && readRaisedByRole(item.raisedByRole) === 'employee';

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
      style={[styles.card, pending && styles.cardPending, { borderLeftColor: meta.color }]}
      onPress={() => onOpen()}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${itemTypeLabel(category, item)}${raisedBy ? `, ${raisedBy}` : ''}, ${badge.label}`}
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
        <RequestTiming category={category} item={item} />
        {!!punchLine && (
          <View style={styles.when}>
            <MaterialCommunityIcons name="map-marker-check-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.whenText} numberOfLines={1}>{punchLine}</Text>
          </View>
        )}
        {!!raisedBy && (
          <View style={styles.when}>
            <MaterialCommunityIcons
              name={raisedByEmployee ? 'account-outline' : 'account-tie-outline'}
              size={13}
              color={Colors.textMuted}
            />
            <Text style={styles.whenText} numberOfLines={1}>{raisedBy}</Text>
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
            <TouchableOpacity style={[styles.actionBtn, styles.approve]} onPress={() => onOpen()} accessibilityRole="button" accessibilityLabel={`Approve ${name}'s request`}>
              <MaterialCommunityIcons name="check" size={15} color={Colors.statusGreen} />
              <Text style={[styles.actionText, { color: Colors.statusGreen }]}>Approve</Text>
            </TouchableOpacity>
          )}
          {canReject && (
            // Opens the sheet with the box already asking for the reason (a rejection cannot be sent without one).
            <TouchableOpacity
              style={[styles.actionBtn, styles.reject]}
              onPress={() => onOpen('reject')}
              accessibilityRole="button"
              accessibilityLabel={`Reject ${name}'s request`}
              accessibilityHint="Opens the request to write the reason for rejecting"
            >
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
    // Waiting for this head's decision: an amber frame, so it stands out among the decided rows (owner 2026-11-25).
    cardPending: {
      borderColor: Colors.statusYellow,
      borderWidth: 1.5,
      ...Platform.select({
        ios: { shadowColor: Colors.statusYellow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 8 },
        android: { elevation: 3 },
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
