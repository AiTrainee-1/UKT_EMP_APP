import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';

import {
  usePendingRequests,
  useApproveLeave,
  useApprovePermission,
  TeamLeaveRequest,
  TeamPermissionRequest,
} from '../../src/hooks/useManager';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';

type Tab = 'leave' | 'permission';
type SelectedRequest =
  | { kind: 'leave'; item: TeamLeaveRequest }
  | { kind: 'permission'; item: TeamPermissionRequest };

// Backend may serialize employee as flat fields OR as a nested object
function empName(item: TeamLeaveRequest | TeamPermissionRequest): string {
  return (
    item.employeeName ||
    item.employee?.name ||
    '—'
  );
}
function empCode(item: TeamLeaveRequest | TeamPermissionRequest): string {
  return (
    item.employeeCode ||
    item.employee?.code ||
    item.employee?.employeeCode ||
    '—'
  );
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
function appliedOn(item: TeamLeaveRequest | TeamPermissionRequest): string {
  const raw = item.appliedOn || item.createdAt;
  if (!raw) return '—';
  try { return format(new Date(raw), 'dd MMM yyyy'); } catch { return raw; }
}

export default function ApprovalsScreen() {
  const [tab, setTab] = useState<Tab>('leave');
  const [selected, setSelected] = useState<SelectedRequest | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data, isLoading, refetch, isRefetching } = usePendingRequests();
  const approveLeave = useApproveLeave();
  const approvePermission = useApprovePermission();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const closeSheet = () => { setSelected(null); setComment(''); };

  const handleAction = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    try {
      if (selected.kind === 'leave') {
        await approveLeave.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      } else {
        await approvePermission.mutateAsync({ id: selected.item.id, status, comment: comment || undefined });
      }
      showToast(
        status === 'approved' ? 'Request approved successfully.' : 'Request rejected.',
        status === 'approved' ? 'success' : 'error',
      );
      closeSheet();
    } catch {
      showToast('Action failed. Please try again.', 'error');
    }
  };

  const isPending = approveLeave.isPending || approvePermission.isPending;
  const leaveList = data?.leaveRequests ?? [];
  const permList = data?.permissionRequests ?? [];
  const activeList = tab === 'leave' ? leaveList : permList;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Approvals</Text>
        <View style={styles.headerBadges}>
          {leaveList.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{leaveList.length} leave</Text>
            </View>
          )}
          {permList.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: `${Colors.statusYellow}22` }]}>
              <Text style={[styles.countText, { color: Colors.statusYellow }]}>{permList.length} perm</Text>
            </View>
          )}
        </View>
      </View>

      {/* Tab Switch */}
      <View style={styles.tabRow}>
        {(['leave', 'permission'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'leave' ? `Leave Requests${leaveList.length ? ` (${leaveList.length})` : ''}` : `Permission${permList.length ? ` (${permList.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={activeList as any[]}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, !activeList.length && styles.listCenter]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState
              icon="check-circle-outline"
              title="All caught up!"
              subtitle={`No pending ${tab === 'leave' ? 'leave' : 'permission'} requests`}
            />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelected(tab === 'leave'
              ? { kind: 'leave', item: item as TeamLeaveRequest }
              : { kind: 'permission', item: item as TeamPermissionRequest }
            )}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <View style={styles.empInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {empName(item as any)?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View>
                  <Text style={styles.empName}>{empName(item as any)}</Text>
                  <Text style={styles.empCode}>{empCode(item as any)}</Text>
                </View>
              </View>
              <Badge label="Pending" variant="pending" />
            </View>

            {tab === 'leave' ? (
              <View style={styles.detail}>
                <Text style={styles.detailType}>{leaveType(item as TeamLeaveRequest)}</Text>
                <Text style={styles.detailSub}>
                  {format(new Date((item as TeamLeaveRequest).startDate + 'T00:00:00'), 'dd MMM')}
                  {(item as TeamLeaveRequest).startDate !== (item as TeamLeaveRequest).endDate
                    ? ` → ${format(new Date((item as TeamLeaveRequest).endDate + 'T00:00:00'), 'dd MMM yyyy')}`
                    : ` ${format(new Date((item as TeamLeaveRequest).startDate + 'T00:00:00'), 'yyyy')}`}
                  {totalDays(item as TeamLeaveRequest) ? ` · ${totalDays(item as TeamLeaveRequest)}` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.detail}>
                <Text style={styles.detailType}>{permType(item as TeamPermissionRequest)}</Text>
                <Text style={styles.detailSub}>
                  {format(new Date((item as TeamPermissionRequest).date + 'T00:00:00'), 'dd MMM yyyy')}
                  {' · '}{(item as TeamPermissionRequest).time}
                </Text>
              </View>
            )}

            {item.reason && <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text>}

            {/* Quick action row */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  setSelected(tab === 'leave'
                    ? { kind: 'leave', item: item as TeamLeaveRequest }
                    : { kind: 'permission', item: item as TeamPermissionRequest });
                  // auto-trigger approve after sheet opens — user can still add comment
                }}
              >
                <MaterialCommunityIcons name="check" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  setSelected(tab === 'leave'
                    ? { kind: 'leave', item: item as TeamLeaveRequest }
                    : { kind: 'permission', item: item as TeamPermissionRequest });
                }}
              >
                <MaterialCommunityIcons name="close" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail / Action Sheet */}
      <BottomSheet
        visible={!!selected}
        onClose={closeSheet}
        title={selected?.kind === 'leave' ? 'Leave Request' : 'Permission Request'}
      >
        {selected && (
          <View>
            {/* Employee */}
            <View style={styles.sheetEmp}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {empName(selected.item)?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View>
                <Text style={styles.sheetEmpName}>{empName(selected.item)}</Text>
                <Text style={styles.sheetEmpCode}>{empCode(selected.item)}</Text>
              </View>
            </View>

            {/* Details */}
            {([
              selected.kind === 'leave'
                ? ['Type', leaveType(selected.item as TeamLeaveRequest)]
                : ['Type', permType(selected.item as TeamPermissionRequest)],
              selected.kind === 'leave'
                ? ['From', format(new Date((selected.item as TeamLeaveRequest).startDate + 'T00:00:00'), 'dd MMM yyyy')]
                : ['Date', format(new Date((selected.item as TeamPermissionRequest).date + 'T00:00:00'), 'dd MMM yyyy')],
              selected.kind === 'leave'
                ? ['To', format(new Date((selected.item as TeamLeaveRequest).endDate + 'T00:00:00'), 'dd MMM yyyy')]
                : ['Time', (selected.item as TeamPermissionRequest).time],
              selected.kind === 'leave' && totalDays(selected.item as TeamLeaveRequest)
                ? ['Days', totalDays(selected.item as TeamLeaveRequest)!]
                : null,
              ['Reason', selected.item.reason],
              ['Applied', appliedOn(selected.item)],
            ] as ([string, string] | null)[]).filter(Boolean).map(([label, value]) => (
              <View key={label} style={styles.sheetRow}>
                <Text style={styles.sheetLabel}>{label}</Text>
                <Text style={styles.sheetValue} numberOfLines={3}>{value}</Text>
              </View>
            ))}

            {/* Comment */}
            <Text style={styles.commentLabel}>Comment (optional)</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor={Colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={2}
            />

            {/* Buttons */}
            <View style={styles.sheetActions}>
              <Button
                title="Approve"
                onPress={() => handleAction('approved')}
                loading={isPending}
                style={{ flex: 1, backgroundColor: Colors.statusGreen }}
              />
              <Button
                title="Reject"
                onPress={() => handleAction('rejected')}
                loading={isPending}
                style={{ flex: 1, backgroundColor: Colors.statusRed }}
              />
            </View>
          </View>
        )}
      </BottomSheet>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 8 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800' },
  headerBadges: { flexDirection: 'row', gap: 6 },
  countBadge: { backgroundColor: `${Colors.primary}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bgCard, borderRadius: 10, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  list: { padding: 16, paddingBottom: 32, gap: 2 },
  listCenter: { flex: 1 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, marginBottom: 10,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  empInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${Colors.primary}33`, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontWeight: '800', fontSize: 16 },
  empName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  empCode: { color: Colors.textMuted, fontSize: 11 },
  detail: { marginBottom: 6 },
  detailType: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  detailSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginBottom: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  approveBtn: { backgroundColor: Colors.statusGreen },
  rejectBtn: { backgroundColor: Colors.statusRed },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Sheet styles
  sheetEmp: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetEmpName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  sheetEmpCode: { color: Colors.textMuted, fontSize: 12 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetLabel: { color: Colors.textMuted, fontSize: 13, flex: 1 },
  sheetValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },
  commentLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  commentInput: {
    backgroundColor: Colors.bgInput ?? Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginBottom: 14,
  },
  sheetActions: { flexDirection: 'row', gap: 10 },
});
