import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { BottomSheet } from '../ui/BottomSheet';
import { ApprovalTrail, DecisionBadge, WaitingChip } from '../approval/ApprovalTrail';
import { hodCanAct, hodCanReject, waitingTarget, type ApprovalProgress } from '../../lib/approval';
import { DEFAULT_PERMISSION_MONTHLY_LIMIT, formatPermissionDuration } from '../../lib/permissions';
import { claimDayLabel, shiftsLabel } from '../../lib/compensation';
import { fmtDay, normalizeOutcome, outcomeLine } from '../../lib/approvalsHistory';
import {
  appliedOn,
  empCode,
  empDepartment,
  empInitial,
  empName,
  itemDateLabel,
  itemTypeLabel,
  onDutyPunches,
  totalDays,
} from '../../lib/approvalsItems';
import { categoryMeta } from './categoryMeta';
import { OnDutyPunchList } from './OnDutyPunchList';
import type { SelectedApproval } from './types';

// A pending list holds only what this Department Head can decide, so this is only seen when a row went stale.
function cannotDecideNote(approval: ApprovalProgress | null | undefined): string {
  const target = waitingTarget(approval);
  return target
    ? `This request is waiting for ${target}, so you can't decide it right now.`
    : 'This request has already been decided.';
}

/** The detail rows of the sheet, per category (the rows the old sheet showed, in the same order). */
function detailRows(sel: SelectedApproval): [string, string][] {
  const { category: c, item } = sel;
  if (c === 'onDuty') {
    const rows: ([string, string] | null)[] = [
      ['Destination', item.destination || '—'],
      ['Date', fmtDay(item.date ?? item.createdAt)],
      item.branchName ? ['Branch', item.branchName] : null,
      ['Requested', fmtDay(item.createdAt, 'dd MMM yyyy, h:mm a')],
      item.employeeEndedAt ? ['Finished', fmtDay(item.employeeEndedAt, 'dd MMM, h:mm a')] : null,
    ];
    return rows.filter((r): r is [string, string] => r !== null);
  }
  if (c === 'resignation') {
    return [
      ['Reason', item.reason || '—'],
      ['Last Working Day', fmtDay(item.lastWorkingDate)],
      ['Submitted', fmtDay(item.createdAt)],
    ];
  }
  const rows: ([string, string] | null)[] = [
    [c === 'outpass' ? 'Destination' : 'Type', itemTypeLabel(c, item)],
    c === 'leave'
      ? ['From', fmtDay(item.startDate)]
      : c === 'outpass'
        ? null
        : [c === 'holidayWork' ? 'Work date' : 'Date', itemDateLabel(c, item).split(' · ')[0]],
    c === 'holidayWork' ? ['Day', claimDayLabel(item as any)] : null,
    c === 'holidayWork' && shiftsLabel(item.shifts) ? ['Shifts claimed', shiftsLabel(item.shifts)!] : null,
    c === 'holidayWork' && item.requestedBy ? ['Raised by', `${item.requestedBy} (HR)`] : null,
    c === 'leave' ? ['To', fmtDay(item.endDate)] : c === 'permission' ? ['Time', item.time ?? item.permissionTime ?? '—'] : null,
    c === 'permission' && formatPermissionDuration(item.durationMinutes)
      ? ['Duration', formatPermissionDuration(item.durationMinutes)!]
      : null,
    c === 'permission' && item.statusLabel ? ['Status', item.statusLabel] : null,
    c === 'leave' && totalDays(item) ? ['Days', totalDays(item)!] : null,
    ['Reason', item.reason || '—'],
    [c === 'holidayWork' ? 'Raised on' : 'Applied', appliedOn(item)],
  ];
  return rows.filter((r): r is [string, string] => r !== null);
}

/**
 * The request's details, its approval trail, and - while it waits for this head - an optional comment with Approve /
 * Reject (only the buttons HR's pipeline allows: hodCanAct / hodCanReject). A decided request (Approved / Rejected
 * lists) shows who decided it instead.
 */
export function DecisionSheet({
  selected,
  comment,
  onCommentChange,
  onDecide,
  busy,
  onClose,
}: {
  selected: SelectedApproval | null;
  comment: string;
  onCommentChange: (text: string) => void;
  onDecide: (decision: 'approved' | 'rejected') => void;
  busy: boolean;
  onClose: () => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta = categoryMeta(Colors);

  const item = selected?.item;
  const canApprove = !!selected && selected.status === 'pending' && hodCanAct(item?.approval);
  const canReject = !!selected && selected.status === 'pending' && hodCanReject(item?.approval);
  const outcome = normalizeOutcome(item?.outcome);
  const line = outcomeLine(outcome);
  const isResignation = selected?.category === 'resignation';

  return (
    <BottomSheet visible={!!selected} onClose={onClose} title={selected ? meta[selected.category].sheetTitle : ''}>
      {selected && item && (
        <View>
          <View style={styles.empRow}>
            <LinearGradient
              colors={isResignation ? (['#C62828', '#E11D48'] as const) : Colors.gradientPrimary}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{empInitial(item)}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.empName}>{empName(item)}</Text>
              <Text style={styles.empCode}>
                {empCode(item)}
                {isResignation && empDepartment(item) ? ` · ${empDepartment(item)}` : ''}
              </Text>
            </View>
          </View>

          {detailRows(selected).map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value} numberOfLines={3}>{value}</Text>
            </View>
          ))}

          {isResignation && (
            <>
              {[item.surveyQ1Answer, item.surveyQ2Answer, item.surveyQ3Answer].some(Boolean) && (
                <Text style={[styles.commentLabel, { marginTop: 10 }]}>Survey Answers</Text>
              )}
              {[
                { q: 'Primary reason for leaving', a: item.surveyQ1Answer },
                { q: 'Would you recommend us?', a: item.surveyQ2Answer },
                { q: 'What could we have done differently?', a: item.surveyQ3Answer },
              ]
                .filter(({ a }) => a)
                .map(({ q, a }) => (
                  <View key={q} style={[styles.row, styles.rowStacked]}>
                    <Text style={[styles.label, { fontSize: 11 }]}>{q}</Text>
                    <Text style={[styles.value, styles.valueStacked]}>{a}</Text>
                  </View>
                ))}
            </>
          )}

          {/* Only when the server speaks the monthly-limit rules (capStatus/statusLabel are new). */}
          {selected.category === 'permission' && selected.status === 'pending' && (item.capStatus != null || item.statusLabel != null) && (
            <Text style={styles.hint}>
              Only the first {item.monthlyLimit ?? DEFAULT_PERMISSION_MONTHLY_LIMIT} approved permissions an employee has in a
              month are Allowed. Approving one beyond that makes it Overdue / Excess: it will not protect the day and counts
              toward late deductions.
            </Text>
          )}

          {selected.category === 'onDuty' && <OnDutyPunchList punches={onDutyPunches(item)} />}

          {selected.category === 'onDuty' && selected.status === 'pending' && (
            <Text style={styles.hint}>
              Once the request has every approval it needs, the session starts and the punches recorded under it
              {item.pendingPunchCount ? ` (${item.pendingPunchCount})` : ''} count as attendance; a gate pass is issued too.
              Rejecting is final: those punches will not count.
            </Text>
          )}

          {selected.category === 'holidayWork' && selected.status === 'pending' && (
            <Text style={styles.hint}>
              Approving adds {shiftsLabel(item.shifts) ?? 'the claimed shifts'} to {empName(item)}'s compensation balance.
              Rejecting is final and adds nothing.
            </Text>
          )}

          {!!line && (
            <DecisionBadge
              decider={line.decider}
              note={[line.note, outcome?.yourComment ? `Your comment: "${outcome.yourComment}"` : null].filter(Boolean).join(' · ') || null}
              tone={line.tone === 'waiting' ? 'waiting' : undefined}
              style={styles.trail}
              testID="approvals-sheet-decider"
            />
          )}

          <WaitingChip approval={item.approval} style={styles.trail} showDecision={false} />
          <ApprovalTrail approval={item.approval} style={styles.trail} />

          {canApprove || canReject ? (
            <>
              <Text style={styles.commentLabel}>Comment (optional)</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment…"
                placeholderTextColor={Colors.outline}
                selectionColor={Colors.primary}
                cursorColor={Colors.primary}
                value={comment}
                onChangeText={onCommentChange}
                multiline
                numberOfLines={2}
                accessibilityLabel="Comment, optional"
              />
              <View style={styles.actions}>
                {canApprove && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approve, busy && styles.busy]}
                    onPress={() => onDecide('approved')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    testID="approvals-sheet-approve"
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                    <Text style={[styles.actionText, { color: Colors.statusGreen }]}>Approve</Text>
                  </TouchableOpacity>
                )}
                {canReject && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.reject, busy && styles.busy]}
                    onPress={() => onDecide('rejected')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    testID="approvals-sheet-reject"
                  >
                    <MaterialCommunityIcons name="close-circle" size={18} color={Colors.statusRed} />
                    <Text style={[styles.actionText, { color: Colors.statusRed }]}>Reject</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            selected.status === 'pending' && <Text style={styles.hint}>{cannotDecideNote(item.approval)}</Text>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    empRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: Colors.outlineVariant,
    },
    avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontFamily: FontFamily.headlineSemibold, fontSize: 18 },
    empName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16 },
    empCode: { color: Colors.textMuted, fontSize: 12 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.outlineVariant,
      gap: 10,
    },
    rowStacked: { flexDirection: 'column', gap: 3, alignItems: 'flex-start' },
    label: { color: Colors.textMuted, fontSize: 13, flex: 1 },
    value: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },
    valueStacked: { textAlign: 'left', flex: undefined },
    hint: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 12 },
    trail: { marginTop: 12 },
    commentLabel: {
      color: Colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 14,
      marginBottom: 6,
      letterSpacing: 0.3,
    },
    commentInput: {
      backgroundColor: Colors.bgInput,
      borderWidth: 1.5,
      borderColor: Colors.outlineVariant,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: Colors.textPrimary,
      fontSize: 14,
      minHeight: 60,
      textAlignVertical: 'top',
      marginBottom: 16,
    },
    actions: { flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
    },
    approve: { backgroundColor: Colors.badgeGreenBg, borderColor: Colors.clayGreen },
    reject: { backgroundColor: Colors.badgeRedBg, borderColor: Colors.clayRed },
    busy: { opacity: 0.6 },
    actionText: { fontSize: 14, fontWeight: '800' },
  });
