import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { FormScrollView } from '../../src/components/FormScrollView';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MotiView } from 'moti';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useShift } from '../../src/hooks/useShift';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useMissingPunch, useSubmitMissingPunch, PUNCH_SLOT_LABEL, type MissingPunchSlot } from '../../src/hooks/useRequests';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { pipelineSentence, waitingPhrase, workflowOff } from '../../src/lib/approval';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { checkRequestDate } from '../../src/lib/requestWindow';
import { requestPickerLimits } from '../../src/lib/requestWindowForm';
import {
  nowMinutesIfToday,
  parseClock,
  slotTargets,
  slotTimeHint,
  startTimeFor,
  timeProblem,
  to12hLabel,
  toHHmm,
} from '../../src/lib/punchTimePicker';
import { overlapNotice } from '../../src/lib/missingPunchOverlap';
import { PunchTimePicker, type DayPunch } from '../../src/components/myrequests/PunchTimePicker';
import { Reveal } from '../../src/components/Reveal';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { TextArea } from '../../src/components/ui/TextArea';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

const SLOTS: MissingPunchSlot[] = ['morning_in', 'lunch_out', 'lunch_in', 'evening_out'];
const SLOT_ICON: Record<MissingPunchSlot, string> = {
  morning_in: 'login',
  lunch_out: 'silverware-fork-knife',
  lunch_in: 'silverware-fork-knife',
  evening_out: 'logout',
};

const schema = z.object({
  date: z.string().min(1, 'Date is required'),
  punchTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick the time of the punch you missed'),
  punchSlot: z.enum(['morning_in', 'lunch_out', 'lunch_in', 'evening_out']),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(200, 'Reason is too long (max 200 characters)'),
});
type FormData = z.infer<typeof schema>;

/** "2026-10-07" -> [10, 2026]. */
function monthYearOf(date: string): [number, number] {
  const [y, m] = date.split('-').map(Number);
  return [m || new Date().getMonth() + 1, y || new Date().getFullYear()];
}

export default function ReportMissingPunchScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // "Now" is read when the screen renders (and again at submit), never once at module load: the app process lives for
  // days, and the request window moves on the 1st-3rd of a month. A punch cannot be missed tomorrow, so it ends today.
  const now = new Date();
  const limits = requestPickerLimits(now, { noFuture: true });

  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const { data: emp } = useEmployee(employeeId);
  const { data: shift } = useShift(employeeId);
  const submit = useSubmitMissingPunch(employeeId);
  // The employee's own requests (the same cached list the Missing Punch page shows), for the "already sent" reminder.
  const { data: myRequests } = useMissingPunch(employeeId);
  // Who approves a missing punch, and whether HR has switched new ones off. Only a hint that may be a minute old: the
  // server refuses a new request either way and its message is shown (see onSubmit).
  const { data: approvalSummary } = useApprovalSummary();
  const missingPunchFlow = approvalSummary?.missingPunch;

  const [showSuccess, setShowSuccess] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('Your Missing Punch request has been sent for approval.');
  const [toast, setToast] = React.useState({ message: '', type: 'success' as 'success' | 'error', visible: false });
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const initialNow = nowMinutesIfToday(limits.defaultDate, now);
  const { control, handleSubmit, watch, setValue, setError, clearErrors, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: limits.defaultDate,
      punchTime: toHHmm(startTimeFor(null, 'morning_in', initialNow)),
      punchSlot: 'morning_in',
      reason: '',
    },
  });

  const date = watch('date');
  const punchTime = watch('punchTime');
  const punchSlot = watch('punchSlot');
  const minutes = parseClock(punchTime) ?? 9 * 60;
  const nowMin = nowMinutesIfToday(date, now);

  // The time follows the shift until the employee touches it: once the shift arrives, the chosen slot's usual time.
  const timeTouched = React.useRef(false);
  React.useEffect(() => {
    if (shift && !timeTouched.current) {
      setValue('punchTime', toHHmm(startTimeFor(shift, punchSlot, nowMinutesIfToday(date, new Date()))));
    }
  }, [shift]); // eslint-disable-line react-hooks/exhaustive-deps

  // The punches already recorded on the chosen day, from the attendance the app already loads (same month = cached).
  const [month, year] = monthYearOf(date);
  const attendance = useAttendance(employeeId, month, year);
  const record = attendance.data?.records.find((r) => r.date === date);
  const dayPunches: DayPunch[] | 'loading' | 'error' = attendance.isLoading
    ? 'loading'
    : attendance.isError && !attendance.data
      ? 'error'
      : (record?.punches ?? [])
          .map((p) => ({ minutes: parseClock(p.time), type: p.type }))
          .filter((p): p is DayPunch => p.minutes != null)
          .sort((a, b) => a.minutes - b.minutes);

  const pickTime = (m: number) => {
    timeTouched.current = true;
    setValue('punchTime', toHHmm(m));
    clearErrors('punchTime');
  };

  const pickSlot = (slot: MissingPunchSlot) => {
    setValue('punchSlot', slot);
    // Picking the punch jumps straight to its usual time (the employee then fine-tunes it).
    setValue('punchTime', toHHmm(startTimeFor(shift, slot, nowMin)));
    timeTouched.current = false;
    clearErrors('punchTime');
  };

  const pickDate = (v: string) => {
    setValue('date', v);
    clearErrors('date');
    // A time still to come today is pulled back to now.
    const limit = nowMinutesIfToday(v, new Date());
    if (limit != null && minutes > limit) setValue('punchTime', toHHmm(limit));
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const problem = timeProblem(parseClock(punchTime), nowMin);
  const hint = problem ? null : slotTimeHint(punchSlot, minutes, shift);

  const onSubmit = async (data: FormData) => {
    // The server is the authority (India time); these checks, with "now" read at submit, only guide the employee.
    const at = new Date();
    const dateMessage = checkRequestDate(data.date, at, { noFuture: true });
    if (dateMessage) {
      setError('date', { message: dateMessage });
      showToast(dateMessage, 'error');
      return;
    }
    const timeMessage = timeProblem(parseClock(data.punchTime), nowMinutesIfToday(data.date, at));
    if (timeMessage) {
      setError('punchTime', { message: timeMessage });
      showToast(timeMessage, 'error');
      return;
    }
    try {
      const created = await submit.mutateAsync(data);
      // Who it went to first comes from the request the server just created (HR's pipeline decides).
      const firstApprover = waitingPhrase(created?.approval);
      setSuccessMsg(
        firstApprover
          ? `Your Missing Punch request has been sent to ${firstApprover} for approval.`
          : 'Your Missing Punch request has been sent for approval.',
      );
      setShowSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit. Please try again.';
      // A refused date (code request_window_closed) is also marked under the date field.
      if (err?.response?.data?.code === 'request_window_closed') setError('date', { message: msg });
      showToast(msg, 'error');
    }
  };

  const targets = slotTargets(shift);
  // A reminder only, never a block (owner, 2026-10-31): the same punch may be asked again, other punches of the day freely.
  const overlap = overlapNotice(myRequests ?? [], date, punchSlot);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Report Missing Punch</Text>
          <Text style={styles.headerSubtitle}>Tell us the punch you missed</Text>
        </View>
      </View>

      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ─── Employee card ─── */}
          <Reveal index={0}>
            <View style={styles.empCard}>
              <Avatar uri={emp?.photoUrl} name={emp?.name ?? user?.name} size={40} borderColor={Colors.border} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.empName}>{emp?.name ?? user?.name}</Text>
                  {!!emp?.employeeCode && (
                    <View style={styles.empCodePill}>
                      <Text style={styles.empCodePillText}>{emp.employeeCode}</Text>
                    </View>
                  )}
                </View>
                {shift && (
                  <Text style={styles.empShift}>
                    <MaterialCommunityIcons name="clock-outline" size={11} color={Colors.textMuted} />{'  '}
                    {shift.shiftName} ({to12hLabel(targets.morning_in.minutes)} – {to12hLabel(targets.evening_out.minutes)})
                  </Text>
                )}
              </View>
            </View>
          </Reveal>

          {/* ─── 1. Day ─── */}
          <Text style={styles.sectionLabel}>1 · WHICH DAY?</Text>
          <Controller
            control={control}
            name="date"
            render={({ field: { value } }) => (
              <DatePickerField
                label=""
                value={value}
                onChange={pickDate}
                error={errors.date?.message}
                minDate={limits.minDate}
                maxDate={limits.maxDate}
                hint={limits.hint}
              />
            )}
          />

          {/* ─── 2. Slot ─── */}
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>2 · WHICH PUNCH WAS MISSED?</Text>
            <Text style={styles.sectionHint}>1 per request</Text>
          </View>
          <View style={styles.slotGrid} accessibilityRole="radiogroup">
            {SLOTS.map((slot) => {
              const active = punchSlot === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  style={[styles.slotCard, active && styles.slotCardActive]}
                  onPress={() => pickSlot(slot)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${PUNCH_SLOT_LABEL[slot]}, usually ${to12hLabel(targets[slot].minutes)}`}
                  testID={`missing-punch-slot-${slot}`}
                >
                  <View style={styles.slotTopRow}>
                    <MaterialCommunityIcons name={SLOT_ICON[slot] as any} size={15} color={active ? '#fff' : Colors.textMuted} />
                    {active && <MaterialCommunityIcons name="check-circle" size={15} color="#fff" />}
                  </View>
                  <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>{PUNCH_SLOT_LABEL[slot]}</Text>
                  <Text style={[styles.slotTarget, active && styles.slotTargetActive]}>
                    {targets[slot].fromShift ? 'Your shift' : 'Usually'}: {to12hLabel(targets[slot].minutes)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ─── 3. Time ─── */}
          <Text style={styles.sectionLabel}>3 · WHAT TIME?</Text>
          <PunchTimePicker
            value={minutes}
            onChange={pickTime}
            shift={shift}
            slot={punchSlot}
            nowMinutes={nowMin}
            dayPunches={dayPunches}
            problem={errors.punchTime?.message ?? problem}
            hint={hint}
          />

          {/* ─── 4. Reason ─── */}
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, value, onBlur } }) => (
              <TextArea
                label="4 · WHY WAS IT MISSED?"
                placeholder="e.g. The machine did not read my finger"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                minLength={5}
                maxLength={200}
                error={errors.reason?.message}
              />
            )}
          />

          {/* ─── Approval note ─── */}
          <View style={styles.noteCard}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
            <Text style={styles.noteText}>
              {pipelineSentence(missingPunchFlow)} Once approved, the punch is added to your attendance automatically.
            </Text>
          </View>

          <WorkflowOffNote workflow={missingPunchFlow} style={styles.offNote} />
          {(overlap.repeat || overlap.also) && (
            <MotiView
              key={`${date}-${punchSlot}`}
              from={{ opacity: 0, translateY: 6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 220 }}
              style={styles.overlapWrap}
              testID="missing-punch-overlap"
            >
              {overlap.repeat && (
                <View style={styles.repeatCard} accessibilityLiveRegion="polite">
                  <MaterialCommunityIcons name="bell-ring-outline" size={17} color={Colors.badgeYellowText} />
                  <Text style={styles.repeatText}>{overlap.repeat}</Text>
                </View>
              )}
              {overlap.also && (
                <View style={styles.alsoRow}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.alsoText}>{overlap.also}</Text>
                </View>
              )}
            </MotiView>
          )}
          <Button
            title={`Send · ${PUNCH_SLOT_LABEL[punchSlot]} at ${to12hLabel(minutes)}`}
            onPress={handleSubmit(onSubmit)}
            loading={submit.isPending}
            disabled={workflowOff(missingPunchFlow) || !!problem}
            style={{ marginTop: 4 }}
          />
          <TouchableOpacity style={styles.discardBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
            <Text style={styles.discardBtnText}>Discard</Text>
          </TouchableOpacity>
        </FormScrollView>
      </KeyboardAvoider>

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message={successMsg}
        onDone={() => { setShowSuccess(false); router.back(); }}
      />
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 19 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },

  content: { padding: 16, paddingBottom: 40 },

  empCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginBottom: 18,
    ...cardShadow,
  },
  empName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  empCodePill: { backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  empCodePillText: { color: Colors.primary, fontSize: 10, fontWeight: '800' },
  empShift: { color: Colors.textMuted, fontSize: 11.5, marginTop: 3 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  sectionHint: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '600', marginBottom: 8 },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  slotCard: {
    width: '48%',
    minHeight: 76,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    padding: 12,
    gap: 4,
  },
  slotCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  slotTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  slotLabelActive: { color: '#fff' },
  slotTarget: { color: Colors.textMuted, fontSize: 10.5 },
  slotTargetActive: { color: 'rgba(255,255,255,0.8)' },

  noteCard: {
    flexDirection: 'row', gap: 8,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginTop: 8,
    marginBottom: 18,
  },
  noteText: { flex: 1, color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16 },
  offNote: { marginBottom: 14 },
  overlapWrap: { gap: 8, marginBottom: 12 },
  repeatCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  repeatText: { flex: 1, color: Colors.badgeYellowText, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  alsoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  alsoText: { flex: 1, color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },

  discardBtn: { alignItems: 'center', paddingVertical: 14 },
  discardBtnText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
});
