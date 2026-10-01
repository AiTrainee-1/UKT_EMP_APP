import React, { useRef, useState } from 'react';
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
import { router } from 'expo-router';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useLeaveRequests, useLeaveTypes, useApplyLeave, LeaveRequest } from '../../src/hooks/useLeave';
import { useCasualLeaves, useCLEligibility, useApplyCasualLeave } from '../../src/hooks/useCasualLeave';
import { useHolidays } from '../../src/hooks/useHolidays';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { approvalErrorMessage, workflowOff } from '../../src/lib/approval';
import { checkRequestDate } from '../../src/lib/requestWindow';
import {
  casualLeaveAvailable,
  casualLeaveClosedReason,
  casualLeaveDefaultDate,
  casualLeaveMonthBlock,
  isoToLocalDate,
  rangeFieldErrors,
  requestPickerLimits,
} from '../../src/lib/requestWindowForm';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
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
import { UKTLogo } from '../../src/components/UKTLogo';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

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

// The sheet's starting values. `today` is read each time the sheet opens (see openApply), never once at module load.
const makeDefaults = (today: string): FormData => ({
  leaveTypeId: '',
  date: today,
  startDate: today,
  endDate: today,
  reason: '',
});

type ReqTab = 'live' | 'confirmed';

export default function LeaveScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // "Now" is read at render (and again at submit): this tab stays mounted for days, so a value captured at module load
  // would go stale, and be wrong exactly around the 1st-3rd when the request window moves.
  const limits = requestPickerLimits(new Date());
  const todayStr = limits.window.today;

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
  const [clDate, setClDate] = useState(limits.defaultDate);
  const [clReason, setClReason] = useState('');
  // Errors are shown inside the sheets: the Toast is drawn behind their Modal. `server` is the server's own sentence.
  const [clErrors, setClErrors] = useState<{ date?: string; reason?: string; server?: string }>({});
  const [formError, setFormError] = useState('');
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

  const { data: clEligibility, refetch: refetchClEligibility } = useCLEligibility(user?.employeeId ?? null);
  const { data: clRequests } = useCasualLeaves(user?.employeeId ?? null, {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const applyCL = useApplyCasualLeave(user?.employeeId ?? null);
  // HR can switch a kind of request off (Approval Workflow Control). Only a hint that may be a minute old: the server
  // refuses a new request either way and its message is shown (see onSubmit / onSubmitCL).
  const { data: approvalSummary } = useApprovalSummary();
  const leaveOff = workflowOff(approvalSummary?.leave);
  const casualLeaveOff = workflowOff(approvalSummary?.casualLeave);
  const { data: holidays } = useHolidays(new Date().getFullYear());
  const nextHoliday = (holidays ?? [])
    .filter((h) => new Date(h.date) >= new Date(todayStr))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const clProgress = clEligibility?.yearlyEntitlement
    ? Math.max(0, Math.min(1, (clEligibility.remainingThisYear ?? 0) / clEligibility.yearlyEntitlement))
    : 0;

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

  const { control, handleSubmit, reset, watch, setError, clearErrors, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: makeDefaults(limits.defaultDate),
  });

  const watchStart = watch('startDate');
  const watchEnd = watch('endDate');
  // The End Date picker starts at the chosen Start Date, but never before the request window opens.
  const endMinDate = watchStart && watchStart > limits.window.min && watchStart <= limits.window.max
    ? isoToLocalDate(watchStart)
    : limits.minDate;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  // The Toast is drawn behind the sheet's Modal, so a refusal is also shown inside the sheet, above Submit.
  const failInSheet = (message: string) => {
    setFormError(message);
    showToast(message, 'error');
  };

  // Every time the sheet opens it starts from today as of now (this tab stays mounted for days), held inside the window.
  const openApply = () => {
    reset(makeDefaults(requestPickerLimits(new Date()).defaultDate));
    setFormError('');
    setShowApply(true);
  };

  const closeSheet = () => {
    setShowApply(false);
    setMultiDay(false);
    setHalfDay(false);
    setHalfDaySlot('');
    setFormError('');
    reset(makeDefaults(requestPickerLimits(new Date()).defaultDate));
  };

  // Changing any leave date clears every date message, not just the touched field's: the messages were about the dates as they
  // were (fixing the Start Date can settle an End Date error), and the live "end before start" line shows only without one.
  const pickLeaveDate = (next: string, onChange: (v: string) => void) => {
    onChange(next);
    clearErrors(['date', 'startDate', 'endDate']);
    setFormError('');
  };

  // Only the date fields shown for the current mode matter, but the hidden ones still go through the schema. Copy the visible
  // ones into them first, so an error on a field the employee cannot see can never block Submit without a word.
  const submitLeave = () => {
    setFormError('');
    if (multiDay) {
      setValue('date', getValues('startDate'));
    } else {
      setValue('startDate', getValues('date'));
      setValue('endDate', getValues('date'));
    }
    return handleSubmit(onSubmit)();
  };

  const onSubmit = async (data: FormData) => {
    // The server is the authority (India time); this device-clock check, read now, only saves the employee a round trip.
    const now = new Date();
    if (halfDay) {
      if (!halfDaySlot) {
        failInSheet('Please select Morning or Afternoon.');
        return;
      }
      const dateMessage = checkRequestDate(data.date, now);
      if (dateMessage) {
        setError('date', { message: dateMessage });
        setFormError(dateMessage);
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
      } catch (err) {
        failInSheet(approvalErrorMessage(err, 'Failed to submit. Please try again.'));
      }
      return;
    }

    if (!data.leaveTypeId) {
      setError('leaveTypeId', { message: 'Please select a leave type' });
      return;
    }
    const startDate = multiDay ? data.startDate : data.date;
    const endDate = multiDay ? data.endDate : data.date;
    if (multiDay) {
      // Both ends must be inside the window, and the end not before the start; each message goes under the picker it is about.
      const range = rangeFieldErrors(startDate, endDate, now);
      if (range.start) setError('startDate', { message: range.start });
      if (range.end) setError('endDate', { message: range.end });
      if (range.start || range.end) {
        setFormError((range.start ?? range.end) as string);
        return;
      }
    } else {
      const dateMessage = checkRequestDate(startDate, now);
      if (dateMessage) {
        setError('date', { message: dateMessage });
        setFormError(dateMessage);
        return;
      }
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
    } catch (err) {
      failInSheet(approvalErrorMessage(err, 'Failed to submit. Please try again.'));
    }
  };

  // Casual Leave: which months the server says can be applied for (previous month only while the grace is open, then the
  // current month). Absent on an older server, then the single `eligible` flag decides as before.
  const clMonths = clEligibility?.months;
  const clOpen = casualLeaveAvailable(clEligibility?.eligible, clMonths);
  // Set when the month of the picked date is listed and not eligible: shown under the date, and Submit is blocked.
  const clMonthBlock = casualLeaveMonthBlock(clDate, clMonths);
  const clFormError = clErrors.server ?? clErrors.date ?? clErrors.reason;

  // `refresh` false: the answer was just fetched (onCLCardPress), `months` is that fresh list.
  const openCL = (refresh = true, months = clMonths) => {
    // The list may be hours old (this tab stays mounted): ask again, so the months match the day it is opened.
    if (refresh) refetchClEligibility({ cancelRefetch: false });
    // On a grace day with only last month left open it starts on last month, not on a red message about the new month.
    setClDate(casualLeaveDefaultDate(new Date(), months));
    setClReason('');
    setClErrors({});
    setShowCLApply(true);
  };

  // The card is dead while the cached answer says closed, and that answer can be old (the month moved on, or last month's grace
  // days opened it again; nothing else would refresh it). So a tap on a closed card asks the server first, then decides.
  const clTapBusy = useRef(false);
  const onCLCardPress = async () => {
    if (casualLeaveOff) return;
    if (clOpen) {
      openCL();
      return;
    }
    if (clTapBusy.current) return;
    clTapBusy.current = true;
    try {
      const res = await refetchClEligibility({ cancelRefetch: false });
      // A failed refresh keeps the old answer, so only a good one may open the sheet.
      if (res.isSuccess && res.data && casualLeaveAvailable(res.data.eligible, res.data.months)) openCL(false, res.data.months);
    } finally {
      clTapBusy.current = false;
    }
  };

  const closeCLSheet = () => {
    setShowCLApply(false);
    setClDate(casualLeaveDefaultDate(new Date(), clMonths));
    setClReason('');
    setClErrors({});
  };

  // Pull-to-refresh renews the whole screen, the Casual Leave card included.
  const onRefresh = () => {
    refetchReq();
    refetchClEligibility();
  };

  const onSubmitCL = async () => {
    // The server is the authority (India time); this check, with "now" read at submit, only guides the employee.
    const dateMessage = checkRequestDate(clDate, new Date());
    const reasonMessage = clReason.trim().length < 5 ? 'Please provide a reason (min 5 characters).' : undefined;
    if (dateMessage || reasonMessage || clMonthBlock) {
      setClErrors({ date: dateMessage ?? undefined, reason: reasonMessage });
      if (reasonMessage) showToast(reasonMessage, 'error');
      return;
    }
    setClErrors({});
    try {
      await applyCL.mutateAsync({ date: clDate, reason: clReason.trim() });
      closeCLSheet();
      setSuccessMsg('Your casual leave request has been submitted.');
      setShowSuccess(true);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = data?.error || data?.message || 'Failed to submit. Please try again.';
      // A refused date (code request_window_closed) is also marked under the date, where the employee will look for it.
      setClErrors({ date: data?.code === 'request_window_closed' ? msg : undefined, server: msg });
      showToast(msg, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <View style={styles.topBar}>
        <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color={Colors.textPrimary} size={20} />
        <UKTLogo size={28} />
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandName}>UKTEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push('/(tabs)/notifications')}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="account" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageTitleRow}>
          <View>
            <Text style={styles.title}>Leave Portal</Text>
            <Text style={styles.subtitle}>Manage your leave requests</Text>
          </View>
          <TouchableOpacity
            onPress={openApply}
            style={[styles.applyBtn, leaveOff && styles.applyBtnOff]}
            activeOpacity={0.85}
            disabled={leaveOff}
          >
            <MaterialCommunityIcons name="plus" size={16} color="#fff" />
            <Text style={styles.applyText}>Apply Leave</Text>
          </TouchableOpacity>
        </View>
        <WorkflowOffNote workflow={approvalSummary?.leave} style={styles.offNote} />

        {/* Casual Leave */}
        <TouchableOpacity
          style={styles.clCard}
          onPress={onCLCardPress}
          activeOpacity={!clOpen || casualLeaveOff ? 1 : 0.85}
        >
          <View style={styles.clTopRow}>
            <View style={styles.clIcon}>
              <MaterialCommunityIcons name="calendar-star" size={18} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clTitle}>Casual Leave (CL)</Text>
              <Text style={styles.clSub} numberOfLines={1}>
                {!clOpen
                  ? casualLeaveClosedReason(clMonths, clEligibility?.reason || 'Not eligible this month')
                  : `${clRequests?.length ?? 0} applied this month`}
              </Text>
            </View>
            {clOpen && !casualLeaveOff ? (
              <View style={styles.clQuickBtn}>
                <Text style={styles.clQuickBtnText}>Quick Apply</Text>
              </View>
            ) : null}
          </View>
          <WorkflowOffNote workflow={approvalSummary?.casualLeave} />
          {clEligibility?.yearlyEntitlement != null && (
            <>
              <View style={styles.clBalanceRow}>
                <Text style={[styles.clBalanceNum, TabularNums]}>
                  {clEligibility.remainingThisYear}
                  <Text style={styles.clBalanceTotal}> / {clEligibility.yearlyEntitlement} Days Left</Text>
                </Text>
              </View>
              <View style={styles.clProgressTrack}>
                <View style={[styles.clProgressFill, { width: `${clProgress * 100}%` }]} />
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          {[
            { label: 'Approved', value: approvedCount, icon: 'check-circle', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
            { label: 'Submitted', value: submittedCount, icon: 'send-outline', color: Colors.secondary, bg: Colors.secondaryFixed },
            { label: 'Taken', value: totalTaken, icon: 'umbrella', color: Colors.primary, bg: Colors.primaryFixed },
            { label: 'Rejected', value: rejectedCount, icon: 'close-circle', color: Colors.statusRed, bg: Colors.badgeRedBg },
          ].map(({ label, value, icon, color, bg }) => (
            <View key={label} style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: bg }]}>
                <MaterialCommunityIcons name={icon as any} size={16} color={color} />
              </View>
              <Text style={[styles.summaryNum, { color }, TabularNums]}>{value}</Text>
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
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

        {nextHoliday && (
          <TouchableOpacity style={styles.holidayCard} onPress={() => router.push('/holidays')} activeOpacity={0.85}>
            <View style={styles.holidayIcon}>
              <MaterialCommunityIcons name="party-popper" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.holidayTitle}>Upcoming Holiday</Text>
              <Text style={styles.holidaySub} numberOfLines={1}>
                {nextHoliday.name} · {format(new Date(nextHoliday.date), 'd MMM yyyy')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
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
                        onPress={() => { onChange(String(t.id)); setFormError(''); }}
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
            onValueChange={(v) => { setMultiDay(v); if (v) setHalfDay(false); setFormError(''); }}
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
            onValueChange={(v) => { setHalfDay(v); if (v) setMultiDay(false); else setHalfDaySlot(''); setFormError(''); }}
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
                  onPress={() => { setHalfDaySlot(opt.key); setFormError(''); }}
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
              <DatePickerField
                label="Date"
                value={value}
                onChange={(v) => pickLeaveDate(v, onChange)}
                error={errors.date?.message}
                minDate={limits.minDate}
                maxDate={limits.maxDate}
                hint={limits.hint}
              />
            )}
          />
        ) : (
          <>
            <Controller
              control={control}
              name="startDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField
                  label="Start Date"
                  value={value}
                  onChange={(v) => pickLeaveDate(v, onChange)}
                  error={errors.startDate?.message}
                  minDate={limits.minDate}
                  maxDate={limits.maxDate}
                  hint={limits.hint}
                />
              )}
            />
            <Controller
              control={control}
              name="endDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField
                  label="End Date"
                  value={value}
                  onChange={(v) => pickLeaveDate(v, onChange)}
                  error={errors.endDate?.message}
                  minDate={endMinDate}
                  maxDate={limits.maxDate}
                  hint={limits.hint}
                />
              )}
            />
            {watchStart && watchEnd && watchEnd < watchStart && !errors.endDate && (
              <Text style={styles.errorText}>End date must be on or after start date.</Text>
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
              onChangeText={(t) => { onChange(t); setFormError(''); }}
              onBlur={onBlur}
              minLength={5}
              maxLength={300}
              error={errors.reason?.message}
            />
          )}
        />

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        <WorkflowOffNote workflow={approvalSummary?.leave} style={styles.offNote} />
        <Button title="Submit Leave Request" onPress={submitLeave} loading={applyLeave.isPending} disabled={leaveOff} />
      </BottomSheet>

      {/* Apply Casual Leave Sheet */}
      <BottomSheet visible={showCLApply} onClose={closeCLSheet} title="Apply for Casual Leave">
        <DatePickerField
          label="Date"
          value={clDate}
          onChange={(v) => { setClDate(v); setClErrors((e) => ({ ...e, date: undefined, server: undefined })); }}
          error={clErrors.date ?? clMonthBlock ?? undefined}
          minDate={limits.minDate}
          maxDate={limits.maxDate}
          hint={limits.hint}
        />
        <TextArea
          label="Reason"
          placeholder="Describe your reason for casual leave…"
          value={clReason}
          onChangeText={(t) => { setClReason(t); setClErrors((e) => ({ ...e, reason: undefined, server: undefined })); }}
          minLength={5}
          maxLength={200}
          error={clErrors.reason}
        />
        {/* The same sentence again next to Submit: the field it belongs to may be scrolled out of sight. */}
        {clFormError ? <Text style={styles.errorText}>{clFormError}</Text> : null}
        <WorkflowOffNote workflow={approvalSummary?.casualLeave} style={styles.offNote} />
        <Button title="Submit Request" onPress={onSubmitCL} loading={applyCL.isPending} disabled={casualLeaveOff || !!clMonthBlock} />
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

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  brandTextWrap: { gap: 1 },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 13, letterSpacing: 0.2 },
  brandSub: { color: Colors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  avatarBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  pageTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 22 },
  subtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  applyText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  applyBtnOff: { opacity: 0.5 },
  offNote: { marginBottom: 14 },

  content: { paddingHorizontal: 16, paddingBottom: 100, gap: 4, paddingTop: 8 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 16 },

  // Summary cards
  summaryGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    marginTop: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  summaryCard: { flex: 1, alignItems: 'center', gap: 6 },
  summaryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summaryNum: { fontSize: 18, fontWeight: '900' },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },

  clCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  clTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.secondaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  clTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  clSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
  clQuickBtn: { backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 6 },
  clQuickBtnText: { color: Colors.primary, fontSize: 10.5, fontWeight: '800' },
  clBalanceRow: { flexDirection: 'row', alignItems: 'baseline' },
  clBalanceNum: { color: Colors.primary, fontFamily: FontFamily.displayBold, fontSize: 24 },
  clBalanceTotal: { color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12 },
  clProgressTrack: { height: 5, borderRadius: 3, backgroundColor: Colors.bgSurfaceLow, overflow: 'hidden' },
  clProgressFill: { height: 5, borderRadius: 3, backgroundColor: Colors.primary },

  holidayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12,
    marginTop: 14,
  },
  holidayIcon: { width: 38, height: 38, borderRadius: BorderRadius.md, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  holidayTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  holidaySub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    gap: 4,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
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
