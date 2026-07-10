import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions, useSubmitPermission } from '../../src/hooks/useRequests';
import { useShiftStats } from '../../src/hooks/useShiftStats';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { TextArea } from '../../src/components/ui/TextArea';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { DatePickerField, TimePickerField } from '../../src/components/ui/DatePickerField';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const PERMISSION_TYPES = ['Early Out', 'Late In', 'Short Leave'];
const now = new Date();
const todayStr = format(now, 'yyyy-MM-dd');

const schema = z.object({
  type: z.string().min(1, 'Select a type'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(200, 'Reason is too long (max 200 characters)'),
});
type FormData = z.infer<typeof schema>;

type ReqTab = 'live' | 'confirmed';

function currency(n: number) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

export default function RequestsScreen() {
  const { user } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [tab, setTab] = useState<ReqTab>('live');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data, isLoading, refetch, isRefetching } = usePermissions(user?.employeeId ?? null, month, year);
  const { data: shiftStats } = useShiftStats(month, year);
  const submit = useSubmitPermission(user?.employeeId ?? null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: '', date: todayStr, time: '09:30', reason: '' },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (formData: FormData) => {
    try {
      await submit.mutateAsync(formData);
      setShowNew(false);
      reset({ type: '', date: todayStr, time: '09:30', reason: '' });
      setShowSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit. Please try again.';
      showToast(msg, 'error');
    }
  };

  const items = data?.items ?? [];
  const monthlyUsed = data?.monthlyUsed ?? 0;
  const monthlyLimit = data?.monthlyLimit ?? 3;
  const remaining = Math.max(0, monthlyLimit - monthlyUsed);

  const liveList = items.filter((i) => i.status === 'Pending');
  const confirmedList = items.filter((i) => i.status !== 'Pending');
  const activeList = tab === 'live' ? liveList : confirmedList;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={activeList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !activeList.length && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <>
            {/* Usage + deduction stats */}
            <View style={styles.statsCard}>
              <View style={styles.statsTopRow}>
                <View style={styles.usageRing}>
                  <Text style={styles.usageNum}>{remaining}</Text>
                  <Text style={styles.usageLabel}>left</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.usageTitle}>Permissions this month</Text>
                  <Text style={styles.usageSub}>{monthlyUsed} of {monthlyLimit} used</Text>
                </View>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statNum}>{shiftStats?.totalLateCount ?? '—'}</Text>
                  <Text style={styles.statLabel}>Late Count</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNum}>{shiftStats?.summary.shiftDeductions ?? '—'}</Text>
                  <Text style={styles.statLabel}>Shift Deduction</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: Colors.statusRed }]}>
                    {shiftStats ? currency(shiftStats.summary.salaryDeductionAmount) : '—'}
                  </Text>
                  <Text style={styles.statLabel}>Salary Deduction</Text>
                </View>
              </View>
            </View>

            {/* Tab switch */}
            <View style={styles.tabBar}>
              {([
                { key: 'live' as ReqTab, label: 'Live Requests', count: liveList.length },
                { key: 'confirmed' as ReqTab, label: 'Confirmed Requests', count: confirmedList.length },
              ]).map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                  onPress={() => setTab(t.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                    {t.label} ({t.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View>{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState
              icon="hand-pointing-right"
              title={tab === 'live' ? 'No live requests' : 'No confirmed requests'}
              subtitle="Your permission requests will appear here"
            />
          )
        }
        renderItem={({ item }) => {
          const variant = item.status === 'Approved' ? 'approved' : item.status === 'Rejected' ? 'rejected' : 'pending';
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.type}>{item.type}</Text>
                <Badge label={item.status} variant={variant} />
              </View>
              <Text style={styles.dateTime}>
                {format(new Date(item.date), 'dd MMM yyyy')} · {item.time}
              </Text>
              {item.reason && <Text style={styles.reason}>{item.reason}</Text>}
            </View>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, remaining === 0 && styles.fabDisabled]}
        onPress={() => setShowNew(true)}
      >
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* New Request Sheet */}
      <BottomSheet visible={showNew} onClose={() => { setShowNew(false); reset(); }} title="New Permission Request">
        {remaining === 0 && (
          <View style={styles.capWarning}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.statusRed} />
            <Text style={styles.capWarningText}>
              You've used all {monthlyLimit} permissions this month. Submitting will likely be rejected.
            </Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Request Type</Text>
        <Controller
          control={control}
          name="type"
          render={({ field: { onChange, value } }) => (
            <View style={styles.typeRow}>
              {PERMISSION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, value === t && styles.chipActive]}
                  onPress={() => onChange(t)}
                >
                  <Text style={[styles.chipText, value === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
        {errors.type && <Text style={styles.errorText}>{errors.type.message}</Text>}

        <Controller
          control={control}
          name="date"
          render={({ field: { onChange, value } }) => (
            <DatePickerField label="Date" value={value} onChange={onChange} error={errors.date?.message} />
          )}
        />

        <Controller
          control={control}
          name="time"
          render={({ field: { onChange, value } }) => (
            <TimePickerField label="Time" value={value} onChange={onChange} error={errors.time?.message} />
          )}
        />

        <Controller
          control={control}
          name="reason"
          render={({ field: { onChange, value, onBlur } }) => (
            <TextArea
              label="Reason"
              placeholder="Describe your reason..."
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              minLength={5}
              maxLength={200}
              error={errors.reason?.message}
            />
          )}
        />

        <Button title="Submit Request" onPress={handleSubmit(onSubmit)} loading={submit.isPending} />
      </BottomSheet>

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message="Your permission request has been sent for approval."
        onDone={() => setShowSuccess(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 100 },
  center: { flex: 1 },

  statsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 14,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.10, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  statsTopRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  usageRing: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.primary,
  },
  usageNum: { color: Colors.primary, fontSize: 18, fontWeight: '900' },
  usageLabel: { color: Colors.primary, fontSize: 8, fontWeight: '700', marginTop: -2 },
  usageTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  usageSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  statsDivider: { height: 1, backgroundColor: Colors.outlineVariant },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', gap: 2, flex: 1 },
  statNum: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 4,
    gap: 4,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  tabBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },

  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  dateTime: { color: Colors.textMuted, fontSize: 13 },
  reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  fabDisabled: { opacity: 0.7 },
  capWarning: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.badgeRedBg,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginBottom: 14,
  },
  capWarningText: { flex: 1, color: Colors.badgeRedText, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.outlineVariant },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}22` },
  chipText: { color: Colors.textMuted, fontSize: 13 },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },
  errorText: { color: Colors.statusRed, fontSize: 12, marginBottom: 8 },
});
