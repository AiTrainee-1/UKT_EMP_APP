import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { format } from 'date-fns';

import {
  usePendingRequests,
  useApproveLeave,
  useApprovePermission,
  useResignationAction,
  useApproveCasualLeave,
  useApproveAttendance,
  useApproveMissingPunch,
  useApproveOutpass,
  TeamLeaveRequest,
  TeamPermissionRequest,
  TeamResignationRequest,
  TeamCasualLeaveRequest,
  TeamAttendanceRequest,
  TeamMissingPunchRequest,
  TeamOutpassRequest,
} from '../../src/hooks/useManager';
import { PUNCH_SLOT_LABEL } from '../../src/hooks/useRequests';
import { useManagerProfile } from '../../src/hooks/useManager';
import { useAuth } from '../../src/hooks/useAuth';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';

type Tab = 'leave' | 'permission' | 'resignation' | 'casualLeave' | 'attendance' | 'missingPunch' | 'outpass';
type GenericItem = TeamLeaveRequest | TeamPermissionRequest | TeamCasualLeaveRequest | TeamAttendanceRequest | TeamMissingPunchRequest | TeamOutpassRequest;
type SelectedRequest =
  | { kind: 'leave'; item: TeamLeaveRequest }
  | { kind: 'permission'; item: TeamPermissionRequest }
  | { kind: 'resignation'; item: TeamResignationRequest }
  | { kind: 'casualLeave'; item: TeamCasualLeaveRequest }
  | { kind: 'attendance'; item: TeamAttendanceRequest }
  | { kind: 'missingPunch'; item: TeamMissingPunchRequest }
  | { kind: 'outpass'; item: TeamOutpassRequest };

function empName(item: GenericItem): string {
  return item.employeeName || item.employee?.name || '—';
}
function empCode(item: GenericItem): string {
  return item.employeeCode || item.employee?.code || item.employee?.employeeCode || '—';
}
function leaveType(item: TeamLeaveRequest): string {
  return item.leaveType || item.leaveTypeName || '—';
}
function permType(item: TeamPermissionRequest): string {
  return item.type || item.permissionType || '—';
}
function totalDays(item: TeamLeaveRequest): string | null {
  const d = item.totalDays ?? item.days;
  return d ? `${d} day(s)` : null;
}
function appliedOn(item: GenericItem): string {
  const raw = (item as any).appliedOn || item.createdAt;
  if (!raw) return '—';
  try { return format(new Date(raw), 'dd MMM yyyy'); } catch { return raw; }
}
function fmtDate(str: string | null | undefined): string {
  if (!str) return '—';
  try { return format(new Date(str), 'dd MMM yyyy'); } catch { return str; }
}

const makeTabMeta = (Colors: Palette): Record<Tab, { label: string; icon: string; iconOutline: string; color?: string; bg?: string }> => ({
  leave: { label: 'Leave', icon: 'umbrella', iconOutline: 'umbrella-outline' },
  permission: { label: 'Permission', icon: 'hand-wave', iconOutline: 'hand-wave-outline' },
  resignation: { label: 'Resignations', icon: 'file-sign', iconOutline: 'file-outline', color: Colors.badgeRedText, bg: Colors.badgeRedBg },
  casualLeave: { label: 'Casual Leave', icon: 'calendar-star', iconOutline: 'calendar-star', color: Colors.secondary, bg: Colors.secondaryFixed },
  attendance: { label: 'Attendance', icon: 'calendar-edit', iconOutline: 'calendar-edit', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
  missingPunch: { label: 'Missing Punch', icon: 'fingerprint', iconOutline: 'fingerprint', color: '#5e35b1', bg: '#ede7f6' },
  outpass: { label: 'Outpass', icon: 'exit-run', iconOutline: 'exit-run', color: Colors.primary, bg: Colors.primaryFixed },
});

function itemTypeLabel(tab: Tab, item: GenericItem): string {
  if (tab === 'leave') return leaveType(item as TeamLeaveRequest);
  if (tab === 'permission') return permType(item as TeamPermissionRequest);
  if (tab === 'casualLeave') return 'Casual Leave';
  if (tab === 'attendance') {
    const req = (item as TeamAttendanceRequest).requestedStatus;
    return req ? `Mark as ${req}` : 'Attendance Override';
  }
  if (tab === 'missingPunch') {
    const p = item as TeamMissingPunchRequest;
    return p.punchSlot ? PUNCH_SLOT_LABEL[p.punchSlot] : (p.punchType === 'IN' ? 'Check-In' : 'Check-Out');
  }
  if (tab === 'outpass') return (item as TeamOutpassRequest).destination;
  return '—';
}

function itemDateLabel(tab: Tab, item: GenericItem): string {
  if (tab === 'leave') {
    const l = item as TeamLeaveRequest;
    const days = totalDays(l);
    return `${format(new Date(l.startDate + 'T00:00:00'), 'dd MMM')}`
      + (l.startDate !== l.endDate
        ? ` → ${format(new Date(l.endDate + 'T00:00:00'), 'dd MMM yyyy')}`
        : ` ${format(new Date(l.startDate + 'T00:00:00'), 'yyyy')}`)
      + (days ? ` · ${days}` : '');
  }
  if (tab === 'permission') {
    const p = item as TeamPermissionRequest;
    return `${format(new Date(p.date + 'T00:00:00'), 'dd MMM yyyy')} · ${p.time}`;
  }
  if (tab === 'missingPunch') {
    const p = item as TeamMissingPunchRequest;
    return `${format(new Date(p.date + 'T00:00:00'), 'dd MMM yyyy')} · ${p.punchTime}`;
  }
  if (tab === 'casualLeave' || tab === 'attendance') {
    const d = (item as any).date;
    return d ? format(new Date(d + 'T00:00:00'), 'dd MMM yyyy') : '—';
  }
  if (tab === 'outpass') return appliedOn(item);
  return '—';
}

export default function ApprovalsScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const TAB_META = makeTabMeta(Colors);

  const { user } = useAuth();
  const { data: manager } = useManagerProfile(!!user);

  const [tab, setTab] = useState<Tab>('leave');
  const [selected, setSelected] = useState<SelectedRequest | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data, isLoading, refetch, isRefetching } = usePendingRequests();
  const approveLeave = useApproveLeave();
  const approvePermission = useApprovePermission();
  const resignationAction = useResignationAction();
  const approveCasualLeave = useApproveCasualLeave();
  const approveAttendance = useApproveAttendance();
  const approveMissingPunch = useApproveMissingPunch();
  const approveOutpass = useApproveOutpass();

  const canApproveResignations = manager?.canApproveResignations ?? false;
  const canApproveCasualLeave = manager?.canApproveCasualLeave ?? false;
  const canApproveAttendance = manager?.canApproveAttendance ?? false;
  const canApproveMissingPunch = manager?.canApproveMissingPunch ?? false;
  // Outpass reuses the Permissions capability -see
  // backend/api/manager_views.py::manager_update_outpass_status, which
  // deliberately shares can_approve_permissions rather than a new flag.
  const canApproveOutpass = manager?.canApprovePermissions ?? false;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const closeSheet = () => { setSelected(null); setComment(''); };

  const handleGenericAction = async (status: 'approved' | 'rejected') => {
    if (!selected || selected.kind === 'resignation') return;
    try {
      if (selected.kind === 'leave') {
        await approveLeave.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      } else if (selected.kind === 'permission') {
        await approvePermission.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      } else if (selected.kind === 'casualLeave') {
        await approveCasualLeave.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      } else if (selected.kind === 'missingPunch') {
        await approveMissingPunch.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      } else if (selected.kind === 'outpass') {
        await approveOutpass.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      } else {
        await approveAttendance.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      }
      showToast(
        status === 'approved'
          ? (selected.kind === 'missingPunch' ? 'Forwarded to HR for final approval.' : 'Request approved successfully.')
          : 'Request rejected.',
        status === 'approved' ? 'success' : 'error',
      );
      closeSheet();
    } catch {
      showToast('Action failed. Please try again.', 'error');
    }
  };

  const handleResignationAction = async (action: 'approve' | 'reject') => {
    if (!selected || selected.kind !== 'resignation') return;
    try {
      await resignationAction.mutateAsync({ id: selected.item.id, action, comment: comment || undefined });
      showToast(
        action === 'approve'
          ? 'Resignation forwarded to HR.'
          : 'Resignation rejected.',
        action === 'approve' ? 'success' : 'error',
      );
      closeSheet();
    } catch {
      showToast('Action failed. Please try again.', 'error');
    }
  };

  const selectFor = (t: Tab, item: any): SelectedRequest => ({ kind: t, item } as SelectedRequest);

  const isPending = approveLeave.isPending || approvePermission.isPending || resignationAction.isPending
    || approveCasualLeave.isPending || approveAttendance.isPending || approveMissingPunch.isPending
    || approveOutpass.isPending;

  const leaveList = data?.leaveRequests ?? [];
  const permList = data?.permissionRequests ?? [];
  const resignList = data?.resignations ?? [];
  const casualLeaveList = data?.casualLeaves ?? [];
  const attendanceList = data?.attendanceRequests ?? [];
  const missingPunchList = data?.missingPunchRequests ?? [];
  const outpassList = data?.outpassRequests ?? [];

  const TABS: { key: Tab; icon: string; iconOutline: string; label: string; count: number }[] = [
    { key: 'leave', ...TAB_META.leave, count: leaveList.length },
    { key: 'permission', ...TAB_META.permission, count: permList.length },
    ...(canApproveCasualLeave
      ? [{ key: 'casualLeave' as Tab, ...TAB_META.casualLeave, count: casualLeaveList.length }]
      : []),
    ...(canApproveAttendance
      ? [{ key: 'attendance' as Tab, ...TAB_META.attendance, count: attendanceList.length }]
      : []),
    ...(canApproveMissingPunch
      ? [{ key: 'missingPunch' as Tab, ...TAB_META.missingPunch, count: missingPunchList.length }]
      : []),
    ...(canApproveOutpass
      ? [{ key: 'outpass' as Tab, ...TAB_META.outpass, count: outpassList.length }]
      : []),
    ...(canApproveResignations
      ? [{ key: 'resignation' as Tab, ...TAB_META.resignation, count: resignList.length }]
      : []),
  ];

  const activeList: any[] =
    tab === 'leave' ? leaveList
    : tab === 'permission' ? permList
    : tab === 'casualLeave' ? casualLeaveList
    : tab === 'attendance' ? attendanceList
    : tab === 'missingPunch' ? missingPunchList
    : tab === 'outpass' ? outpassList
    : resignList;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      {/* Header */}
      <LinearGradient
        colors={Colors.gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDeco} />
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>Approvals</Text>
            <Text style={styles.subtitle}>Review pending requests</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Per-category pending counts */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsRow}
        contentContainerStyle={styles.statsRowContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.statCard, tab === t.key && styles.statCardActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <View style={[styles.statIcon, tab === t.key && styles.statIconActive]}>
              <MaterialCommunityIcons
                name={(tab === t.key ? t.icon : t.iconOutline) as any}
                size={16}
                color={tab === t.key ? '#fff' : Colors.primary}
              />
            </View>
            <Text style={styles.statCount}>{t.count}</Text>
            <Text style={styles.statLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={activeList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, !activeList.length && styles.listCenter]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 12 }}>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState
              icon="check-circle-outline"
              title="All caught up!"
              subtitle={`No pending ${TAB_META[tab].label.toLowerCase()} requests`}
            />
          )
        }
        renderItem={({ item, index }) => {
          if (tab === 'resignation') {
            const r = item as TeamResignationRequest;
            return (
              <MotiView
                from={{ opacity: 0, translateY: 10 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260, delay: Math.min(index, 8) * 50 }}
              >
              <TouchableOpacity
                style={styles.card}
                onPress={() => setSelected({ kind: 'resignation', item: r })}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={styles.empRow}>
                    <LinearGradient colors={['#c62828', '#ef5350']} style={styles.avatar}>
                      <Text style={styles.avatarText}>{r.employeeName?.[0]?.toUpperCase() ?? '?'}</Text>
                    </LinearGradient>
                    <View>
                      <Text style={styles.empName}>{r.employeeName}</Text>
                      <Text style={styles.empCode}>{r.employeeCode} · {r.departmentName}</Text>
                    </View>
                  </View>
                  <Badge label="Pending" variant="pending" />
                </View>

                <View style={styles.requestInfo}>
                  <View style={[styles.requestTypeChip, { backgroundColor: Colors.badgeRedBg }]}>
                    <Text style={[styles.requestType, { color: Colors.badgeRedText }]}>Resignation</Text>
                  </View>
                  <Text style={styles.requestDate}>
                    Submitted {fmtDate(r.createdAt)}
                    {r.lastWorkingDate ? ` · Last day ${fmtDate(r.lastWorkingDate)}` : ''}
                  </Text>
                </View>

                {r.reason && (
                  <Text style={styles.reason} numberOfLines={2}>"{r.reason}"</Text>
                )}

                <View style={styles.quickActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => { setSelected({ kind: 'resignation', item: r }); }}
                  >
                    <MaterialCommunityIcons name="check" size={14} color={Colors.statusGreen} />
                    <Text style={[styles.quickBtnText, { color: Colors.statusGreen }]}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => { setSelected({ kind: 'resignation', item: r }); }}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={Colors.statusRed} />
                    <Text style={[styles.quickBtnText, { color: Colors.statusRed }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
              </MotiView>
            );
          }

          const genericItem = item as GenericItem;
          const name = empName(genericItem);
          const initial = name[0]?.toUpperCase() ?? '?';
          const meta = TAB_META[tab];
          return (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 260, delay: Math.min(index, 8) * 50 }}
            >
            <TouchableOpacity
              style={styles.card}
              onPress={() => setSelected(selectFor(tab, genericItem))}
              activeOpacity={0.85}
            >
              <View style={styles.cardTop}>
                <View style={styles.empRow}>
                  <LinearGradient colors={['#006496', '#5dbbff']} style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </LinearGradient>
                  <View>
                    <Text style={styles.empName}>{name}</Text>
                    <Text style={styles.empCode}>{empCode(genericItem)}</Text>
                  </View>
                </View>
                <Badge label="Pending" variant="pending" />
              </View>

              <View style={styles.requestInfo}>
                <View style={[styles.requestTypeChip, meta.bg ? { backgroundColor: meta.bg } : null]}>
                  <Text style={[styles.requestType, meta.color ? { color: meta.color } : null]}>
                    {itemTypeLabel(tab, genericItem)}
                  </Text>
                </View>
                <Text style={styles.requestDate}>{itemDateLabel(tab, genericItem)}</Text>
              </View>

              {genericItem.reason && (
                <Text style={styles.reason} numberOfLines={2}>"{genericItem.reason}"</Text>
              )}

              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => setSelected(selectFor(tab, genericItem))}
                >
                  <MaterialCommunityIcons name="check" size={14} color={Colors.statusGreen} />
                  <Text style={[styles.quickBtnText, { color: Colors.statusGreen }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => setSelected(selectFor(tab, genericItem))}
                >
                  <MaterialCommunityIcons name="close" size={14} color={Colors.statusRed} />
                  <Text style={[styles.quickBtnText, { color: Colors.statusRed }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
            </MotiView>
          );
        }}
      />

      {/* Detail Sheet — Leave / Permission / Casual Leave / Attendance / Missing Punch */}
      <BottomSheet
        visible={!!selected && ['leave', 'permission', 'casualLeave', 'attendance', 'missingPunch', 'outpass'].includes(selected.kind)}
        onClose={closeSheet}
        title={selected && selected.kind !== 'resignation' ? `${TAB_META[selected.kind].label} Request` : ''}
      >
        {selected && selected.kind !== 'resignation' && (
          <View>
            <View style={styles.sheetEmpRow}>
              <LinearGradient colors={['#006496', '#5dbbff']} style={styles.sheetAvatar}>
                <Text style={styles.sheetAvatarText}>{empName(selected.item)[0]?.toUpperCase() ?? '?'}</Text>
              </LinearGradient>
              <View>
                <Text style={styles.sheetEmpName}>{empName(selected.item)}</Text>
                <Text style={styles.sheetEmpCode}>{empCode(selected.item)}</Text>
              </View>
            </View>

            {([
              [selected.kind === 'outpass' ? 'Destination' : 'Type', itemTypeLabel(selected.kind, selected.item)],
              selected.kind === 'leave'
                ? ['From', format(new Date((selected.item as TeamLeaveRequest).startDate + 'T00:00:00'), 'dd MMM yyyy')]
                : selected.kind === 'outpass'
                ? null
                : ['Date', itemDateLabel(selected.kind, selected.item).split(' · ')[0]],
              selected.kind === 'leave'
                ? ['To', format(new Date((selected.item as TeamLeaveRequest).endDate + 'T00:00:00'), 'dd MMM yyyy')]
                : selected.kind === 'permission'
                ? ['Time', (selected.item as TeamPermissionRequest).time]
                : null,
              selected.kind === 'leave' && totalDays(selected.item as TeamLeaveRequest)
                ? ['Days', totalDays(selected.item as TeamLeaveRequest)!]
                : null,
              ['Reason', selected.item.reason],
              ['Applied', appliedOn(selected.item)],
            ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
              <View key={label} style={styles.sheetRow}>
                <Text style={styles.sheetLabel}>{label}</Text>
                <Text style={styles.sheetValue} numberOfLines={3}>{value}</Text>
              </View>
            ))}

            <Text style={styles.commentLabel}>Comment (optional)</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor={Colors.outline}
              selectionColor={Colors.primary}
              cursorColor={Colors.primary}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={2}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetApproveBtn}
                onPress={() => handleGenericAction('approved')}
                disabled={isPending}
              >
                <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                <Text style={[styles.sheetActionText, { color: Colors.statusGreen }]}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetRejectBtn}
                onPress={() => handleGenericAction('rejected')}
                disabled={isPending}
              >
                <MaterialCommunityIcons name="close-circle" size={18} color={Colors.statusRed} />
                <Text style={[styles.sheetActionText, { color: Colors.statusRed }]}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Detail Sheet — Resignation */}
      <BottomSheet
        visible={!!selected && selected.kind === 'resignation'}
        onClose={closeSheet}
        title="Resignation Request"
      >
        {selected?.kind === 'resignation' && (() => {
          const r = selected.item;
          return (
            <View>
              <View style={styles.sheetEmpRow}>
                <LinearGradient colors={['#c62828', '#ef5350']} style={styles.sheetAvatar}>
                  <Text style={styles.sheetAvatarText}>{r.employeeName?.[0]?.toUpperCase() ?? '?'}</Text>
                </LinearGradient>
                <View>
                  <Text style={styles.sheetEmpName}>{r.employeeName}</Text>
                  <Text style={styles.sheetEmpCode}>{r.employeeCode} · {r.departmentName}</Text>
                </View>
              </View>

              {[
                ['Reason', r.reason],
                ['Last Working Day', fmtDate(r.lastWorkingDate)],
                ['Submitted', fmtDate(r.createdAt)],
              ].map(([label, value]) => (
                <View key={label} style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>{label}</Text>
                  <Text style={styles.sheetValue} numberOfLines={3}>{value}</Text>
                </View>
              ))}

              {/* Survey answers */}
              {[r.surveyQ1Answer, r.surveyQ2Answer, r.surveyQ3Answer].some(Boolean) && (
                <Text style={[styles.commentLabel, { marginTop: 10 }]}>Survey Answers</Text>
              )}
              {[
                { q: 'Primary reason for leaving', a: r.surveyQ1Answer },
                { q: 'Would you recommend us?', a: r.surveyQ2Answer },
                { q: 'What could we have done differently?', a: r.surveyQ3Answer },
              ].filter(({ a }) => a).map(({ q, a }) => (
                <View key={q} style={[styles.sheetRow, { flexDirection: 'column', gap: 3, alignItems: 'flex-start' }]}>
                  <Text style={[styles.sheetLabel, { fontSize: 11 }]}>{q}</Text>
                  <Text style={[styles.sheetValue, { textAlign: 'left', flex: undefined }]}>{a}</Text>
                </View>
              ))}

              <Text style={styles.commentLabel}>Comment (optional)</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment…"
                placeholderTextColor={Colors.outline}
              selectionColor={Colors.primary}
              cursorColor={Colors.primary}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={2}
              />

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={styles.sheetApproveBtn}
                  onPress={() => handleResignationAction('approve')}
                  disabled={isPending}
                >
                  <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                  <Text style={[styles.sheetActionText, { color: Colors.statusGreen }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetRejectBtn}
                  onPress={() => handleResignationAction('reject')}
                  disabled={isPending}
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color={Colors.statusRed} />
                  <Text style={[styles.sheetActionText, { color: Colors.statusRed }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </BottomSheet>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute', top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  statsRow: {
    marginTop: -16,
    marginBottom: 14,
  },
  statsRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  statCard: {
    width: 84,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  statCardActive: { borderColor: Colors.primary },
  statIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  statIconActive: { backgroundColor: Colors.primary },
  statCount: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' },

  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  listCenter: { flex: 1 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.10, shadowRadius: 14 },
      android: { elevation: 4 },
    }),
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  empName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  empCode: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },

  requestInfo: { gap: 4 },
  requestTypeChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  requestType: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  requestDate: { color: Colors.textMuted, fontSize: 12 },
  reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic' },

  quickActions: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.badgeGreenBg,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.badgeRedBg,
  },
  quickBtnText: { fontSize: 12, fontWeight: '700' },

  // Sheet
  sheetEmpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  sheetAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sheetAvatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  sheetEmpName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  sheetEmpCode: { color: Colors.textMuted, fontSize: 12 },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  sheetLabel: { color: Colors.textMuted, fontSize: 13, flex: 1 },
  sheetValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },
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
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetApproveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.badgeGreenBg,
    borderWidth: 1.5,
    borderColor: Colors.clayGreen,
  },
  sheetRejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.badgeRedBg,
    borderWidth: 1.5,
    borderColor: Colors.clayRed,
  },
  sheetActionText: { fontSize: 14, fontWeight: '800' },
});
