import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useLeaveRequests, useLeaveTypes, useApplyLeave, LeaveRequest } from '../../src/hooks/useLeave';
import { useCasualLeaves, useCLEligibility, useApplyCasualLeave } from '../../src/hooks/useCasualLeave';
import { LeaveCard } from '../../src/components/LeaveCard';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { TextArea } from '../../src/components/ui/TextArea';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';

const todayStr = format(new Date(), 'yyyy-MM-dd');

const schema = z.object({
  // Not required at the schema level -a Half Day request skips the leave-type
  // picker entirely (see the halfDay branch in onSubmit), so this is only
  // validated when halfDay is false.
  leaveTypeId: z.string(),
  date: z.string().min(1, 'Date is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(5, 'Please provide a reason (min 5 characters)').max(300, 'Reason is too long (max 300 characters)'),
});
type FormData = z.infer<typeof schema>;

const defaultValues: FormData = {
  leaveTypeId: '',
  date: todayStr,
  startDate: todayStr,
  endDate: todayStr,
  reason: '',
};

type ReqTab = 'live' | 'confirmed';

export default function LeaveScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };
  const [showApply, setShowApply] = useState(false);
  const [showCLApply, setShowCLApply] = useState(false);
  const [clDate, setClDate] = useState(todayStr);
  const [clReason, setClReason] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [halfDay, setHalfDay] = useState(false);
  const [halfDaySlot, setHalfDaySlot] = useState<'morning' | 'afternoon' | ''>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('Your leave request has been sent for approval.');
  const [tab, setTab] = useState<ReqTab>('live');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data: requests, isLoading: reqLoading, refetch: refetchReq, isRefetching } = useLeaveRequests(user?.employeeId ?? null);
  const { data: leaveTypes, isLoading: typesLoading } = useLeaveTypes();
  const applyLeave = useApplyLeave(user?.employeeId ?? null);

  const { data: clEligibility } = useCLEligibility(user?.employeeId ?? null);
  const { data: clRequests } = useCasualLeaves(user?.employeeId ?? null, {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const applyCL = useApplyCasualLeave(user?.employeeId ?? null);

  const allRequests = requests ?? [];
  const uniqueTypes = Array.from(new Set(allRequests.map((r) => r.leaveType).filter(Boolean)));

  const passesFilters = (r: LeaveRequest) => {
    if (typeFilter && r.leaveType !== typeFilter) return false;
    if (dateFrom && r.endDate < dateFrom) return false;
    if (dateTo && r.startDate > dateTo) return false;
    return true;
  };

  const liveList = allRequests.filter((r) => r.status === 'Pending').filter(passesFilters);
  const confirmedList = allRequests.filter((r) => r.status !== 'Pending').filter(passesFilters);
  const activeList = tab === 'live' ? liveList : confirmedList;

  const totalTaken = allRequests
    .filter((r) => r.status === 'Approved')
    .reduce((sum, r) => sum + (r.totalDays ?? r.days ?? 0), 0);
  const submittedCount = allRequests.length;
  const approvedCount = allRequests.filter((r) => r.status === 'Approved').length;
  const rejectedCount = allRequests.filter((r) => r.status === 'Rejected').length;

  const hasActiveFilters = !!typeFilter || !!dateFrom || !!dateTo;
  const clearFilters = () => { setTypeFilter(null); setDateFrom(undefined); setDateTo(undefined); };

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
    setHalfDay(false);
    setHalfDaySlot('');
    reset(defaultValues);
  };

  const onSubmit = async (data: FormData) => {
    if (halfDay) {
      if (!halfDaySlot) {
        showToast('Please select Morning or Afternoon.', 'error');
        return;
      }
      try {
        await applyLeave.mutateAsync({
          startDate: data.date,
          endDate: data.date,
          reason: data.reason,
          isHalfDay: true,
          halfDaySlot,
        });
        closeSheet();
        setSuccessMsg('Your half-day leave request has been sent for approval.');
        setShowSuccess(true);
      } catch {
        showToast('Failed to submit. Please try again.', 'error');
      }
      return;
    }

    if (!data.leaveTypeId) {
      setError('leaveTypeId', { message: 'Please select a leave type' });
      return;
    }
    const startDate = multiDay ? data.startDate : data.date;
    const endDate = multiDay ? data.endDate : data.date;
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
      closeSheet();
      setSuccessMsg('Your leave request has been sent for approval.');
      setShowSuccess(true);
    } catch {
      showToast('Failed to submit. Please try again.', 'error');
    }
  };

  const closeCLSheet = () => {
    setShowCLApply(false);
    setClDate(todayStr);
    setClReason('');
  };

  const onSubmitCL = async () => {
    if (clReason.trim().length < 5) {
      showToast('Please provide a reason (min 5 characters).', 'error');
      return;
    }
    try {
      await applyCL.mutateAsync({ date: clDate, reason: clReason.trim() });
      closeCLSheet();
      setSuccessMsg('Your casual leave request has been submitted.');
      setShowSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit. Please try again.';
      showToast(msg, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      <LinearGradient
        colors={Colors.gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDeco} />
        <View style={styles.headerContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color="#fff" size={20} />
            <View>
              <Text style={styles.title}>Leave</Text>
              <Text style={styles.subtitle}>Manage your leave requests</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowApply(true)} style={styles.applyBtn} activeOpacity={0.8}>
            <MaterialCommunityIcons name="plus" size={18} color="#006496" />
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetchReq}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          {[
            { label: 'Taken', value: totalTaken, icon: 'umbrella', color: Colors.primary, bg: Colors.primaryFixed },
            { label: 'Submitted', value: submittedCount, icon: 'send-outline', color: Colors.secondary, bg: Colors.secondaryFixed },
            { label: 'Approved', value: approvedCount, icon: 'check-circle', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
            { label: 'Rejected', value: rejectedCount, icon: 'close-circle', color: Colors.statusRed, bg: Colors.badgeRedBg },
          ].map(({ label, value, icon, color, bg }) => (
            <View key={label} style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: bg }]}>
                <MaterialCommunityIcons name={icon as any} size={16} color={color} />
              </View>
              <Text style={[styles.summaryNum, { color }]}>{value}</Text>
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Casual Leave */}
        <TouchableOpacity
          style={styles.clCard}
          onPress={() => clEligibility?.eligible !== false && setShowCLApply(true)}
          activeOpacity={clEligibility?.eligible === false ? 1 : 0.85}
        >
          <View style={styles.clIcon}>
            <MaterialCommunityIcons name="calendar-star" size={20} color={Colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clTitle}>Casual Leave</Text>
            <Text style={styles.clSub} numberOfLines={2}>
              {clEligibility?.eligible === false
                ? clEligibility.reason || 'Not eligible this month'
                : `${clRequests?.length ?? 0} applied this month · Tap to apply`}
            </Text>
          </View>
          {clEligibility?.eligible !== false && (
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

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

        {/* Filters toggle */}
        <TouchableOpacity style={styles.filterToggle} onPress={() => setShowFilters((v) => !v)} activeOpacity={0.8}>
          <MaterialCommunityIcons name="filter-variant" size={16} color={Colors.primary} />
          <Text style={styles.filterToggleText}>Filters{hasActiveFilters ? ' · Active' : ''}</Text>
          <MaterialCommunityIcons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        {showFilters && (
          <View style={styles.filterPanel}>
            <Text style={styles.fieldLabel}>Leave Type</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity
                style={[styles.chip, !typeFilter && styles.chipActive]}
                onPress={() => setTypeFilter(null)}
              >
                <Text style={[styles.chipText, !typeFilter && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {uniqueTypes.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, typeFilter === t && styles.chipActive]}
                  onPress={() => setTypeFilter(typeFilter === t ? null : t)}
                >
                  <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.dateFilterRow}>
              <View style={{ flex: 1 }}>
                <DatePickerField label="From" value={dateFrom ?? ''} onChange={setDateFrom} />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerField label="To" value={dateTo ?? ''} onChange={setDateTo} />
              </View>
            </View>
            {hasActiveFilters && (
              <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersBtn}>
                <MaterialCommunityIcons name="close-circle-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Leave Requests */}
        {reqLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !activeList.length ? (
          <EmptyState
            icon="umbrella-outline"
            title={tab === 'live' ? 'No live requests' : 'No confirmed requests'}
            subtitle={hasActiveFilters ? 'Try adjusting your filters' : 'Your leave applications will appear here'}
          />
        ) : (
          activeList.map((r, i) => <LeaveCard key={r.id} request={r} index={i} />)
        )}
      </ScrollView>

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} onLogout={handleLogout} />

      {/* Apply Leave Sheet */}
      <BottomSheet visible={showApply} onClose={closeSheet} title="Apply for Leave">
        {!halfDay && (
          <>
            <Text style={styles.fieldLabel}>Leave Type</Text>
            <Controller
              control={control}
              name="leaveTypeId"
              render={({ field: { onChange, value } }) => (
                <View style={styles.chipsWrap}>
                  {typesLoading ? (
                    <Text style={styles.helperText}>Loading types…</Text>
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
          </>
        )}

        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <MaterialCommunityIcons name="calendar-range-outline" size={18} color={Colors.primary} />
            <Text style={styles.toggleLabel}>Multi-day leave</Text>
          </View>
          <Switch
            value={multiDay}
            onValueChange={(v) => { setMultiDay(v); if (v) setHalfDay(false); }}
            trackColor={{ false: Colors.outlineVariant, true: Colors.primaryLight }}
            thumbColor={multiDay ? Colors.primary : Colors.bgSurfaceHighest}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <MaterialCommunityIcons name="weather-sunset-up" size={18} color={Colors.primary} />
            <Text style={styles.toggleLabel}>Half-Day leave</Text>
          </View>
          <Switch
            value={halfDay}
            onValueChange={(v) => { setHalfDay(v); if (v) setMultiDay(false); else setHalfDaySlot(''); }}
            trackColor={{ false: Colors.outlineVariant, true: Colors.primaryLight }}
            thumbColor={halfDay ? Colors.primary : Colors.bgSurfaceHighest}
          />
        </View>

        {halfDay && (
          <>
            <Text style={styles.fieldLabel}>Which half?</Text>
            <View style={styles.chipsWrap}>
              {([
                { key: 'morning' as const, label: 'Morning (First Half)' },
                { key: 'afternoon' as const, label: 'Afternoon (Second Half)' },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, halfDaySlot === opt.key && styles.chipActive]}
                  onPress={() => setHalfDaySlot(opt.key)}
                >
                  <Text style={[styles.chipText, halfDaySlot === opt.key && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

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

        <Controller
          control={control}
          name="reason"
          render={({ field: { onChange, value, onBlur } }) => (
            <TextArea
              label="Reason"
              placeholder="Describe your reason for leave…"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              minLength={5}
              maxLength={300}
              error={errors.reason?.message}
            />
          )}
        />

        <Button title="Submit Leave Request" onPress={handleSubmit(onSubmit)} loading={applyLeave.isPending} />
      </BottomSheet>

      {/* Apply Casual Leave Sheet */}
      <BottomSheet visible={showCLApply} onClose={closeCLSheet} title="Apply for Casual Leave">
        <DatePickerField label="Date" value={clDate} onChange={setClDate} minDate={new Date()} />
        <TextArea
          label="Reason"
          placeholder="Describe your reason for casual leave…"
          value={clReason}
          onChangeText={setClReason}
          minLength={5}
          maxLength={200}
        />
        <Button title="Submit Request" onPress={onSubmitCL} loading={applyCL.isPending} />
      </BottomSheet>

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message={successMsg}
        onDone={() => setShowSuccess(false)}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  applyGradient: {},
  applyText: { color: '#006496', fontWeight: '800', fontSize: 14 },

  content: { paddingHorizontal: 16, paddingBottom: 100, gap: 4 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 16 },

  // Summary cards
  summaryGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    paddingVertical: 16,
    marginTop: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.10, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  summaryCard: { flex: 1, alignItems: 'center', gap: 6 },
  summaryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summaryNum: { fontSize: 18, fontWeight: '900' },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },

  clCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  clIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.secondaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  clTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  clSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 4,
    gap: 4,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  tabBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },

  // Filters
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 4,
  },
  filterToggleText: { flex: 1, color: Colors.primary, fontSize: 12, fontWeight: '700' },
  filterPanel: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginBottom: 12,
    gap: 4,
  },
  dateFilterRow: { flexDirection: 'row', gap: 10 },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4 },
  clearFiltersText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },

  // Bottom sheet form styles
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.bgSurfaceLow,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
  chipText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  errorText: { color: Colors.error, fontSize: 12, marginBottom: 8, marginTop: -4 },
  helperText: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
