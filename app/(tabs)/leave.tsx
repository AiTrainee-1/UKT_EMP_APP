import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  StatusBar,
  Alert,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { format } from 'date-fns';
import { MotiView } from 'moti';

import { useAuth } from '../../src/hooks/useAuth';
import { useConfirmSignOut } from '../../src/hooks/useSignOut';
import { useLeaveRequests, useApplyLeave, LeaveRequest } from '../../src/hooks/useLeave';
import { useCasualLeaves, useCLEligibility } from '../../src/hooks/useCasualLeave';
import { useHolidays } from '../../src/hooks/useHolidays';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { approvalErrorMessage, workflowOff } from '../../src/lib/approval';
import { checkRequestDate } from '../../src/lib/requestWindow';
import { isoToLocalDate, rangeFieldErrors, requestPickerLimits } from '../../src/lib/requestWindowForm';
import {
  defaultView,
  monthEmptyText,
  monthForRow,
  rowsForView,
  viewCounts,
  waitingInOtherMonths,
  type RequestView,
  type ViewOptions,
} from '../../src/lib/requestViews';
import { currentMonth, laterMonth, latestMonthOf, monthOf } from '../../src/lib/monthSwitch';
import { useSelectedMonth } from '../../src/hooks/useSelectedMonth';
import { REQUEST_FOCUS_ORDER, requestViewHasInItsMonth } from '../../src/lib/focusItem';
import { useFocusItem, useFocusParam } from '../../src/hooks/useFocusItem';
import { FocusFrame, FocusMissingNote } from '../../src/components/focus/FocusFrame';
import { asPortion, asStatus, clCardState, isYearly, monthKeyOf, showBalance, yearMonths, yearTotals } from '../../src/lib/casualLeave';
import { PLAIN_LEAVE_TYPE, REASON_CATEGORIES, type ReasonCategory } from '../../src/lib/leaveForm';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { RequestViewSwitcher } from '../../src/components/requests/RequestViewSwitcher';
import { WaitingElsewhereNote } from '../../src/components/requests/WaitingElsewhereNote';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { ClEntryCard } from '../../src/components/casualLeave/ClEntryCard';
import { LoadError } from '../../src/components/casualLeave/LoadError';
import { LeaveCard } from '../../src/components/LeaveCard';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { TextArea } from '../../src/components/ui/TextArea';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { UKTLogo } from '../../src/components/UKTLogo';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

const schema = z.object({
  // Why the employee needs leave (owner 2026-10-31): Sick Leave / Emergency / Personal / Other Reasons. Required.
  reasonCategory: z.string().min(1, 'Choose why you need leave'),
  date: z.string().min(1, 'Date is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(5, 'Please provide a reason (min 5 characters)').max(300, 'Reason is too long (max 300 characters)'),
});
type FormData = z.infer<typeof schema>;

// The sheet's starting values. `today` is read each time the sheet opens (see openApply), never once at module load.
const makeDefaults = (today: string): FormData => ({
  reasonCategory: '',
  date: today,
  startDate: today,
  endDate: today,
  reason: '',
});

/** The day(s) a leave request is for: its range (a leave from 30 Sep to 2 Oct shows in both months). */
const leaveDays = (r: LeaveRequest) => [r.startDate, r.endDate] as const;

export default function LeaveScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // "Now" is read at render (and again at submit): this tab stays mounted for days, so a value captured at module load
  // would go stale, and be wrong exactly around the 1st-3rd when the request window moves.
  const limits = requestPickerLimits(new Date());
  const todayStr = limits.window.today;
  const thisYear = new Date().getFullYear();

  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Refused while an On-Duty day is running (src/hooks/useSignOut.ts).
  const handleLogout = useConfirmSignOut();
  const [showApply, setShowApply] = useState(false);
  const [formError, setFormError] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [halfDay, setHalfDay] = useState(false);
  const [halfDaySlot, setHalfDaySlot] = useState<'morning' | 'afternoon' | ''>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('Your leave request has been sent for approval.');
  const [view, setView] = useState<RequestView | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const requestsQuery = useLeaveRequests(employeeId);
  const { data: requests, isLoading: reqLoading, isError: reqFailed, isFetching: reqFetching } = requestsQuery;
  const applyLeave = useApplyLeave(employeeId);

  // Casual Leave lives on its own screen; the card here shows this month and the year at a glance.
  const clEligibility = useCLEligibility(employeeId);
  const clList = useCasualLeaves(employeeId);
  const clRows = useMemo(
    () => (clList.data ?? []).map((r) => ({ id: r.id, date: r.date, portion: asPortion(r.portion), status: asStatus(r.status) })),
    [clList.data],
  );
  const clMonths = useMemo(() => yearMonths(clRows, thisYear), [clRows, thisYear]);
  const clTotals = useMemo(() => yearTotals(clRows, thisYear), [clRows, thisYear]);
  const clMonthsList = clEligibility.data?.months;
  const clThisMonth = clMonthsList?.find((m) => m.month === monthKeyOf(new Date())) ?? clMonthsList?.[clMonthsList.length - 1];
  // Under the yearly balance (2026-11-02) the card says what is left of the year's 12 and draws the balance bar; an older
  // server (no balance) keeps the one-a-month words and the month dials.
  const clBalance = clEligibility.data?.balance ?? null;
  const clYearly = isYearly({ balance: clBalance, rule: clEligibility.data?.rule });
  const clState = clEligibility.data
    ? clCardState({
        balance: clBalance,
        rule: clEligibility.data.rule,
        month: clThisMonth,
        eligible: clEligibility.data.eligible,
        reason: clEligibility.data.reason,
      })
    : null;
  const clBalanceShown = showBalance({ balance: clBalance, eligible: clEligibility.data?.eligible, months: clMonthsList });

  // HR can switch a kind of request off (Approval Workflow Control). Only a hint that may be a minute old: the server
  // refuses a new request either way and its message is shown (see onSubmit).
  const { data: approvalSummary } = useApprovalSummary();
  const leaveOff = workflowOff(approvalSummary?.leave);
  const { data: holidays } = useHolidays(thisYear);
  const nextHoliday = (holidays ?? [])
    .filter((h) => new Date(h.date) >= new Date(todayStr))
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  // The month switcher (owner 2026-11-02): the four views list and count only the leave of the month on screen, by the
  // days each leave is FOR (a range overlapping the month counts). Waiting / This month (every leave of the month) /
  // Approved / Rejected. The month opens on the current one; the › arrow stops there, unless a leave lies in a later month.
  const allRequests = requests ?? [];
  const [month, setMonth] = useSelectedMonth();
  const maxMonth = laterMonth(currentMonth(), latestMonthOf(allRequests, leaveDays) ?? currentMonth());
  const viewOpts: ViewOptions<LeaveRequest> = {
    statusOf: (r) => r.status,
    scope: { ...month, daysOf: leaveDays },
  };
  const counts = viewCounts(allRequests, viewOpts);
  const activeView = view ?? defaultView(counts);
  const shown = rowsForView(allRequests, activeView, viewOpts);
  const elsewhere = waitingInOtherMonths(allRequests, viewOpts);
  const empty = monthEmptyText(activeView, 'leave requests', month, counts.month);

  // A notification's View opens this tab with ?focus=<leave request id> (src/lib/notificationTarget.ts): the month of
  // that leave opens first, then the view that holds it, the page scrolls to it and it pulses once (useFocusItem.ts).
  const scrollRef = useRef<ScrollViewInstance>(null);
  const focus = useFocusItem<LeaveRequest, RequestView>({
    request: useFocusParam(),
    rows: requests,
    idOf: (r) => r.id,
    views: { order: REQUEST_FOCUS_ORDER, current: activeView, set: setView, has: (r, v) => requestViewHasInItsMonth(r, v, viewOpts) },
    reveal: (r) => {
      const m = monthForRow(r, viewOpts);
      if (m) setMonth(m);
    },
    refresh: () => requestsQuery.refetch(),
    fetching: reqFetching,
    scrollRef,
  });

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
    const reasonCategory = data.reasonCategory as ReasonCategory;
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
          type: PLAIN_LEAVE_TYPE,
          reasonCategory,
          startDate: data.date,
          endDate: data.date,
          reason: data.reason,
          isHalfDay: true,
          halfDaySlot,
        });
        closeSheet();
        setView('waiting');
        // Show the month the new request is for, so it is right there under Waiting.
        setMonth(monthOf(data.date) ?? currentMonth());
        setSuccessMsg('Your half-day leave request has been sent for approval.');
        setShowSuccess(true);
      } catch (err) {
        failInSheet(approvalErrorMessage(err, 'Failed to submit. Please try again.'));
      }
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
      // A plain "Leave" with the reason category: never a Casual Leave type, never an id the app made up.
      await applyLeave.mutateAsync({ type: PLAIN_LEAVE_TYPE, reasonCategory, startDate, endDate, reason: data.reason });
      closeSheet();
      setView('waiting');
      setMonth(monthOf(startDate) ?? currentMonth());
      setSuccessMsg('Your leave request has been sent for approval.');
      setShowSuccess(true);
    } catch (err) {
      failInSheet(approvalErrorMessage(err, 'Failed to submit. Please try again.'));
    }
  };

  // Pull-to-refresh renews the whole screen, the Casual Leave card included.
  const onRefresh = () => {
    void requestsQuery.refetch();
    void clEligibility.refetch();
    void clList.refetch();
  };
  const refreshing = requestsQuery.isRefetching || clList.isRefetching;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />

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
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
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
            <Text style={styles.subtitle}>Your leave and Casual Leave</Text>
          </View>
          <TouchableOpacity
            onPress={openApply}
            style={[styles.applyBtn, leaveOff && styles.applyBtnOff]}
            activeOpacity={0.85}
            disabled={leaveOff}
            testID="leave-apply"
          >
            <MaterialCommunityIcons name="plus" size={16} color="#fff" />
            <Text style={styles.applyText}>Apply Leave</Text>
          </TouchableOpacity>
        </View>
        <WorkflowOffNote workflow={approvalSummary?.leave} style={styles.offNote} />

        {/* Casual Leave: this month and the year, opens its own screen. (`as Href`: typed routes learn the new screen on
            the next Metro start; the cast is harmless after that.) */}
        <ClEntryCard
          state={clState}
          months={clList.data ? clMonths : null}
          year={thisYear}
          takenDays={clTotals.takenDays}
          waitingDays={clTotals.waitingDays}
          loading={clEligibility.isLoading}
          failed={(clEligibility.isError && !clEligibility.data) || (clList.isError && !clList.data)}
          onPress={() => router.push('/casual-leave' as Href)}
          footer={<WorkflowOffNote workflow={approvalSummary?.casualLeave} />}
          balance={clBalanceShown ? clBalance : null}
          yearly={clYearly}
        />

        <Text style={styles.sectionTitle}>Your leave requests</Text>
        <MonthSwitcher value={month} onChange={setMonth} max={maxMonth} style={styles.monthSwitch} testID="leave-month" />
        <View style={styles.switcherWrap}>
          <RequestViewSwitcher
            value={activeView}
            counts={counts}
            onChange={setView}
            month={month}
            testID="leave-views"
          />
        </View>
        <WaitingElsewhereNote
          count={elsewhere.count}
          month={elsewhere.month}
          onShow={(m) => { setMonth(m); setView('waiting'); }}
        />
        {focus.missing && <FocusMissingNote onDismiss={focus.dismissMissing} />}

        {/* Leave Requests */}
        {reqFailed && !requests ? (
          <LoadError title="Could not load your leave requests" onRetry={() => void requestsQuery.refetch()} busy={reqFetching} />
        ) : reqLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !shown.length ? (
          <EmptyState icon="umbrella-outline" title={empty.title} subtitle={empty.subtitle} />
        ) : (
          shown.map((r, i) => (
            <FocusFrame key={r.id} {...focus.frame(r.id)} bottomInset={10}>
              <LeaveCard request={r} index={i} />
            </FocusFrame>
          ))
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
        <Text style={styles.fieldLabel}>Why do you need leave?</Text>
        <Controller
          control={control}
          name="reasonCategory"
          render={({ field: { onChange, value } }) => (
            <View style={styles.categoryGrid} accessibilityRole="radiogroup">
              {REASON_CATEGORIES.map((c) => {
                const active = value === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={styles.categoryCell}
                    onPress={() => { onChange(c.key); clearErrors('reasonCategory'); setFormError(''); }}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${c.label}. ${c.hint}`}
                    testID={`leave-category-${c.key}`}
                  >
                    <MotiView
                      animate={{ scale: active ? 1 : 0.97 }}
                      transition={{ type: 'timing', duration: 160 }}
                      style={[styles.category, active && styles.categoryActive]}
                    >
                      <MaterialCommunityIcons name={c.icon as any} size={20} color={active ? Colors.primary : Colors.textMuted} />
                      <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{c.label}</Text>
                      <Text style={styles.categoryHint} numberOfLines={2}>{c.hint}</Text>
                    </MotiView>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        />
        {errors.reasonCategory && <Text style={styles.errorText}>{errors.reasonCategory.message as string}</Text>}
        <Text style={styles.clHint}>Casual Leave is applied separately, from the Casual Leave card.</Text>

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
              placeholder="Tell your approver a little more…"
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
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16, marginTop: 4, marginBottom: 4 },
  switcherWrap: { marginHorizontal: -16, marginBottom: 8 },
  monthSwitch: { marginTop: 4, marginBottom: 6 },

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

  // Bottom sheet form styles
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 6 },
  categoryCell: { width: '50%', padding: 4 },
  category: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.bgSurfaceLow,
    padding: 12,
    gap: 4,
    minHeight: 88,
  },
  categoryActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
  categoryLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  categoryLabelActive: { color: Colors.primary },
  categoryHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 15 },
  clHint: { color: Colors.textMuted, fontSize: 11.5, marginBottom: 12 },
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
