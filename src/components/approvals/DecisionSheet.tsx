import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputInstance } from 'react-native';
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
import { claimDetailRows, claimPendingHint } from '../../lib/compensation';
import { fmtDay, normalizeOutcome, outcomeLine } from '../../lib/approvalsHistory';
import { REJECT_REMARK_MIN } from '../../lib/rejectRemark';
import {
  appliedOn,
  empCode,
  empDepartment,
  empInitial,
  empName,
  itemDateLabel,
  itemTypeLabel,
  onDutyJourneyId,
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
  if (c === 'holidayWork') {
    // Every kind of compensation claim: its own rows (OT times, allowance minutes, birthday, the day off), then who raised
    // it (the employee or HR).
    return [
      ['Type', itemTypeLabel(c, item)],
      ...claimDetailRows(item as any),
      ['Reason', item.reason || '—'],
      ['Raised on', appliedOn(item)],
    ];
  }
  const rows: ([string, string] | null)[] = [
    [c === 'outpass' ? 'Destination' : 'Type', itemTypeLabel(c, item)],
    c === 'leave'
      ? ['From', fmtDay(item.startDate)]
      : c === 'outpass'
        ? null
        : ['Date', itemDateLabel(c, item).split(' · ')[0]],
    c === 'leave' ? ['To', fmtDay(item.endDate)] : c === 'permission' ? ['Time', item.time ?? item.permissionTime ?? '—'] : null,
    c === 'permission' && formatPermissionDuration(item.durationMinutes)
      ? ['Duration', formatPermissionDuration(item.durationMinutes)!]
      : null,
    c === 'permission' && item.statusLabel ? ['Status', item.statusLabel] : null,
    c === 'leave' && totalDays(item) ? ['Days', totalDays(item)!] : null,
    ['Reason', item.reason || '—'],
    ['Applied', appliedOn(item)],
  ];
  return rows.filter((r): r is [string, string] => r !== null);
}

/**
 * The request's details, its approval trail, and - while it waits for this head - the comment box with Approve / Reject
 * (only the buttons HR's pipeline allows: hodCanAct / hodCanReject). Approving needs no comment; rejecting needs the
 * reason (src/lib/rejectRemark.ts): once the head is rejecting (`rejecting`, or Reject is the only button) the box is
 * labelled "Reason for rejecting (required)". A decided request (Approved / Rejected lists) shows who decided it instead.
 * An On-Duty request with a recorded route offers "View route" (`onViewRoute`).
 */
export function DecisionSheet({
  selected,
  comment,
  onCommentChange,
  onDecide,
  busy,
  onClose,
  onViewRoute,
  rejecting = false,
  reasonError,
  error,
}: {
  selected: SelectedApproval | null;
  comment: string;
  onCommentChange: (text: string) => void;
  onDecide: (decision: 'approved' | 'rejected') => void;
  busy: boolean;
  onClose: () => void;
  /** Open the recorded route of an On-Duty day (the journey screen). */
  onViewRoute?: (journeyId: number) => void;
  /** The head is rejecting (the card's Reject, or Reject pressed here): the box asks for the reason. */
  rejecting?: boolean;
  /** Why the rejection was not sent (no reason / too short, or the server's "remark_required"), shown under the box. */
  reasonError?: string | null;
  /** Any other failure while the sheet stays open, shown in the sheet (a toast would be hidden behind its Modal). */
  error?: string | null;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta = categoryMeta(Colors);
  const inputRef = useRef<TextInputInstance>(null);

  const item = selected?.item;
  const canApprove = !!selected && selected.status === 'pending' && hodCanAct(item?.approval);
  const canReject = !!selected && selected.status === 'pending' && hodCanReject(item?.approval);
  const reasonMode = canReject && (rejecting || !canApprove);
  const message = reasonError || error || null;

  // Pressing Reject without a reason puts the cursor in the box, so the head can type it straight away.
  useEffect(() => {
    if (reasonError) inputRef.current?.focus();
  }, [reasonError]);
  const outcome = normalizeOutcome(item?.outcome);
  const line = outcomeLine(outcome);
  const isResignation = selected?.category === 'resignation';
  const journeyId = selected?.category === 'onDuty' ? onDutyJourneyId(item) : null;

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

          {journeyId != null && onViewRoute && (
            <TouchableOpacity
              style={styles.routeBtn}
              onPress={() => onViewRoute(journeyId)}
              accessibilityRole="button"
              accessibilityLabel={`View route of ${empName(item)}'s day`}
              testID="approvals-sheet-view-route"
            >
              <MaterialCommunityIcons name="map-marker-path" size={18} color={Colors.primary} />
              <Text style={styles.routeText}>View route</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.primary} />
            </TouchableOpacity>
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
            <Text style={styles.hint}>{claimPendingHint(item as any, empName(item))}</Text>
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
              <Text style={styles.commentLabel}>{reasonMode ? 'Reason for rejecting (required)' : 'Comment (optional)'}</Text>
              <View style={styles.commentBlock}>
                <TextInput
                  ref={inputRef}
                  style={[styles.commentInput, !!reasonError && styles.commentInputError]}
                  placeholder={reasonMode ? 'Why is this request rejected?' : 'Add a comment…'}
                  placeholderTextColor={Colors.outline}
                  selectionColor={Colors.primary}
                  cursorColor={Colors.primary}
                  value={comment}
                  onChangeText={onCommentChange}
                  multiline
                  numberOfLines={2}
                  accessibilityLabel={reasonMode ? 'Reason for rejecting, required' : 'Comment, optional'}
                  testID="approvals-sheet-comment"
                />
                {message ? (
                  <View
                    style={styles.message}
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
                    testID={reasonError ? 'approvals-sheet-reason-error' : 'approvals-sheet-error'}
                  >
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.statusRed} />
                    <Text style={styles.messageText}>{message}</Text>
                  </View>
                ) : canApprove && canReject && !reasonMode ? (
                  <Text style={styles.commentHint}>Approve needs no comment. To reject, write the reason.</Text>
                ) : null}
              </View>
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
                    accessibilityHint={`Needs the reason for rejecting, at least ${REJECT_REMARK_MIN} characters`}
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
    routeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      minHeight: 44,
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: Colors.primary,
      backgroundColor: Colors.bgSurfaceLow,
    },
    routeText: { color: Colors.primary, fontSize: 14, fontWeight: '800' },
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
    },
    commentInputError: { borderColor: Colors.statusRed },
    commentBlock: { gap: 6, marginBottom: 16 },
    commentHint: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },
    message: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: Colors.badgeRedBg,
      borderRadius: BorderRadius.md,
      padding: 10,
    },
    messageText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
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
