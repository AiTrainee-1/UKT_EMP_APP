import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useLeaveBalances, useLeaveRequests, useLeaveTypes, useApplyLeave } from '../../src/hooks/useLeave';
import { LeaveCard } from '../../src/components/LeaveCard';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { Colors } from '../../src/constants/colors';

const todayStr = format(new Date(), 'yyyy-MM-dd');

const schema = z.object({
  leaveTypeId: z.string().min(1, 'Please select a leave type'),
  date: z.string().min(1, 'Date is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(5, 'Please provide a reason (min 5 characters)'),
});
type FormData = z.infer<typeof schema>;

const defaultValues: FormData = {
  leaveTypeId: '',
  date: todayStr,
  startDate: todayStr,
  endDate: todayStr,
  reason: '',
};

export default function LeaveScreen() {
  const { user } = useAuth();
  const [showApply, setShowApply] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data: balances, isLoading: balLoading, refetch: refetchBal } = useLeaveBalances(user?.employeeId ?? null);
  const { data: requests, isLoading: reqLoading, refetch: refetchReq, isRefetching } = useLeaveRequests(user?.employeeId ?? null);
  const { data: leaveTypes, isLoading: typesLoading } = useLeaveTypes();
  const applyLeave = useApplyLeave(user?.employeeId ?? null);

  const { control, handleSubmit, reset, watch, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const watchStart = watch('startDate');
  const watchEnd = watch('endDate');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const closeSheet = () => {
    setShowApply(false);
    setMultiDay(false);
    reset(defaultValues);
  };

  const onSubmit = async (data: FormData) => {
    const startDate = multiDay ? data.startDate : data.date;
    const endDate = multiDay ? data.endDate : data.date;

    // Validate multi-day range
    if (multiDay && endDate < startDate) {
      setError('endDate', { message: 'End date must be on or after start date' });
      return;
    }

    try {
      await applyLeave.mutateAsync({
        leaveTypeId: Number(data.leaveTypeId),
        startDate,
        endDate,
        reason: data.reason,
      });
      showToast('Leave request submitted successfully!', 'success');
      closeSheet();
    } catch {
      showToast('Failed to submit. Please try again.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Leave</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => { refetchBal(); refetchReq(); }}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Leave Balance */}
        <Text style={styles.sectionTitle}>Leave Balance</Text>
        {balLoading ? (
          <SkeletonCard />
        ) : !balances?.length ? (
          <View style={styles.emptyBalance}>
            <Text style={styles.emptyBalanceText}>No leave balance data</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.balScroll}>
            {balances.map((b) => (
              <View key={b.leaveType} style={styles.balCard}>
                <Text style={styles.balType}>{b.leaveType}</Text>
                <Text style={styles.balNum}>
                  {b.used}<Text style={styles.balTotal}>/{b.total}</Text>
                </Text>
                <Text style={styles.balUsed}>{b.remaining} remaining</Text>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${Math.min(((b.used ?? 0) / (b.total || 1)) * 100, 100)}%` as any }]} />
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Leave Requests */}
        <Text style={styles.sectionTitle}>My Requests</Text>
        {reqLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !requests?.length ? (
          <EmptyState icon="umbrella-outline" title="No leave requests" subtitle="Your leave applications will appear here" />
        ) : (
          requests.map((r) => <LeaveCard key={r.id} request={r} />)
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowApply(true)}>
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Apply Leave Sheet */}
      <BottomSheet visible={showApply} onClose={closeSheet} title="Apply Leave">
        {/* Leave Type */}
        <Text style={styles.fieldLabel}>Leave Type</Text>
        <Controller
          control={control}
          name="leaveTypeId"
          render={({ field: { onChange, value } }) => (
            <View style={styles.chipsWrap}>
              {typesLoading ? (
                <Text style={styles.helperText}>Loading...</Text>
              ) : !leaveTypes?.length ? (
                <Text style={styles.helperText}>No leave types configured</Text>
              ) : (
                leaveTypes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.chip, value === String(t.id) && styles.chipActive]}
                    onPress={() => onChange(String(t.id))}
                  >
                    <Text style={[styles.chipText, value === String(t.id) && styles.chipTextActive]}>
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        />
        {errors.leaveTypeId && <Text style={styles.errorText}>{errors.leaveTypeId.message as string}</Text>}

        {/* Multi-day toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Multi-day leave</Text>
          <Switch
            value={multiDay}
            onValueChange={(v) => setMultiDay(v)}
            trackColor={{ false: Colors.border, true: `${Colors.primary}88` }}
            thumbColor={multiDay ? Colors.primary : Colors.textMuted}
          />
        </View>

        {/* Date pickers */}
        {!multiDay ? (
          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, value } }) => (
              <DatePickerField label="Date" value={value} onChange={onChange} error={errors.date?.message} />
            )}
          />
        ) : (
          <>
            <Controller
              control={control}
              name="startDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField label="Start Date" value={value} onChange={onChange} error={errors.startDate?.message} />
              )}
            />
            <Controller
              control={control}
              name="endDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField
                  label="End Date"
                  value={value}
                  onChange={onChange}
                  error={errors.endDate?.message}
                  minDate={watchStart ? new Date(watchStart + 'T00:00:00') : undefined}
                />
              )}
            />
            {watchStart && watchEnd && watchEnd < watchStart && (
              <Text style={styles.errorText}>End date must be on or after start date</Text>
            )}
          </>
        )}

        {/* Reason */}
        <Controller
          control={control}
          name="reason"
          render={({ field: { onChange, value, onBlur } }) => (
            <Input
              label="Reason"
              placeholder="Describe your reason..."
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              numberOfLines={3}
              error={errors.reason?.message}
              style={{ minHeight: 80, textAlignVertical: 'top' } as any}
            />
          )}
        />

        <Button title="Submit Leave Request" onPress={handleSubmit(onSubmit)} loading={applyLeave.isPending} />
      </BottomSheet>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  header: { padding: 16, paddingTop: 8 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 100, gap: 4 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 10, marginTop: 8 },
  emptyBalance: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  emptyBalanceText: { color: Colors.textMuted, fontSize: 13 },
  balScroll: { marginBottom: 8 },
  balCard: {
    backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, marginRight: 12, width: 150, gap: 4,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  balType: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  balNum: { color: Colors.textPrimary, fontSize: 28, fontWeight: '900' },
  balTotal: { color: Colors.textMuted, fontSize: 16, fontWeight: '400' },
  balUsed: { color: Colors.primary, fontSize: 12 },
  progressBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 4 },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  fab: {
    position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}22` },
  chipText: { color: Colors.textMuted, fontSize: 13 },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },
  errorText: { color: Colors.statusRed, fontSize: 12, marginBottom: 8, marginTop: -4 },
  helperText: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, marginBottom: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border,
  },
  toggleLabel: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
