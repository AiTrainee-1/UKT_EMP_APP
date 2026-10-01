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
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useShift } from '../../src/hooks/useShift';
import { useSubmitMissingPunch, PUNCH_SLOT_LABEL, type MissingPunchSlot } from '../../src/hooks/useRequests';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { pipelineSentence, waitingPhrase, workflowOff } from '../../src/lib/approval';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { checkRequestDate } from '../../src/lib/requestWindow';
import { requestPickerLimits } from '../../src/lib/requestWindowForm';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { TextArea } from '../../src/components/ui/TextArea';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { Colors } from '../../src/constants/colors';
import { UKTLogo } from '../../src/components/UKTLogo';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const SLOTS: MissingPunchSlot[] = ['morning_in', 'lunch_out', 'lunch_in', 'evening_out'];
const SLOT_ICON: Record<MissingPunchSlot, string> = {
  morning_in: 'login',
  lunch_out: 'silverware-fork-knife',
  lunch_in: 'silverware-fork-knife',
  evening_out: 'logout',
};

const schema = z.object({
  date: z.string().min(1, 'Date is required'),
  punchTime: z.string().min(1, 'Time is required'),
  punchSlot: z.enum(['morning_in', 'lunch_out', 'lunch_in', 'evening_out']),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(200, 'Reason is too long (max 200 characters)'),
});
type FormData = z.infer<typeof schema>;

function shiftTargetTime(slot: MissingPunchSlot, shift?: { startTime: string; endTime: string } | null) {
  if (slot === 'morning_in') return shift?.startTime ?? '09:00 AM';
  if (slot === 'evening_out') return shift?.endTime ?? '06:00 PM';
  return slot === 'lunch_out' ? '01:00 PM' : '01:45 PM';
}

export default function ReportMissingPunchScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // "Now" is read when the screen renders (and again at submit), never once at module load: the app process lives for
  // days, and the request window moves on the 1st-3rd of a month. A punch cannot be missed tomorrow, so it ends today.
  const limits = requestPickerLimits(new Date(), { noFuture: true });

  const { user } = useAuth();
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data: shift } = useShift(user?.employeeId ?? null);
  const submit = useSubmitMissingPunch(user?.employeeId ?? null);
  // Who approves a missing punch, and whether HR has switched new ones off. Only a hint that may be a minute old: the
  // server refuses a new request either way and its message is shown (see onSubmit).
  const { data: approvalSummary } = useApprovalSummary();
  const missingPunchFlow = approvalSummary?.missingPunch;

  const [showSuccess, setShowSuccess] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('Your Missing Punch request has been sent for approval.');
  const [toast, setToast] = React.useState({ message: '', type: 'success' as 'success' | 'error', visible: false });

  const { control, handleSubmit, watch, setValue, setError, clearErrors, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: limits.defaultDate, punchTime: '09:05', punchSlot: 'morning_in', reason: '' },
  });

  const punchTime = watch('punchTime');
  const punchSlot = watch('punchSlot');

  const adjustTime = (deltaMinutes: number) => {
    const [h, m] = punchTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + deltaMinutes, 0, 0);
    setValue('punchTime', format(d, 'HH:mm'));
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (data: FormData) => {
    // The server is the authority (India time); this check, with "now" read at submit, only guides the employee.
    const dateMessage = checkRequestDate(data.date, new Date(), { noFuture: true });
    if (dateMessage) {
      setError('date', { message: dateMessage });
      showToast(dateMessage, 'error');
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

  const timeAsDate = (() => {
    const [h, m] = punchTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <UKTLogo size={26} />
        <View>
          <Text style={styles.brandName}>UKTEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
      </View>

      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Report Missing Punch</Text>
          <Text style={styles.subtitle}>Submit the punch you missed for review</Text>

          {/* ─── Employee card ─── */}
          <View style={styles.empCard}>
            <Avatar uri={emp?.photoUrl} name={emp?.name ?? user?.name} size={40} borderColor={Colors.border} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.empName}>{emp?.name ?? user?.name}</Text>
                <View style={styles.empCodePill}>
                  <Text style={styles.empCodePillText}>{emp?.employeeCode}</Text>
                </View>
              </View>
              {shift && (
                <Text style={styles.empShift}>
                  <MaterialCommunityIcons name="clock-outline" size={11} color={Colors.textMuted} />{'  '}
                  {shift.shiftName} ({shift.startTime} – {shift.endTime})
                </Text>
              )}
            </View>
          </View>

          {/* ─── Date of incident ─── */}
          <Text style={styles.sectionLabel}>DATE OF INCIDENT</Text>
          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, value } }) => (
              <DatePickerField
                label=""
                value={value}
                onChange={(v) => { onChange(v); clearErrors('date'); }}
                error={errors.date?.message}
                minDate={limits.minDate}
                maxDate={limits.maxDate}
                hint={limits.hint}
              />
            )}
          />

          {/* ─── Slot selector ─── */}
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>WHICH PUNCH WAS MISSED?</Text>
            <Text style={styles.sectionHint}>1 slot per request</Text>
          </View>
          <Controller
            control={control}
            name="punchSlot"
            render={({ field: { onChange, value } }) => (
              <View style={styles.slotGrid}>
                {SLOTS.map((slot) => {
                  const active = value === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.slotCard, active && styles.slotCardActive]}
                      onPress={() => onChange(slot)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.slotTopRow}>
                        <MaterialCommunityIcons
                          name={SLOT_ICON[slot] as any}
                          size={15}
                          color={active ? '#fff' : Colors.textMuted}
                        />
                        {active && <MaterialCommunityIcons name="check-circle" size={15} color="#fff" />}
                      </View>
                      <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>
                        {PUNCH_SLOT_LABEL[slot]}
                      </Text>
                      <Text style={[styles.slotTarget, active && styles.slotTargetActive]}>
                        Target: {shiftTargetTime(slot, shift)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          />

          {/* ─── Actual time claimed (stepper) ─── */}
          <Text style={styles.sectionLabel}>ACTUAL TIME CLAIMED</Text>
          <View style={styles.timeCard}>
            <View style={styles.timeIconWrap}>
              <MaterialCommunityIcons name="alarm" size={18} color={Colors.textSecondary} />
            </View>
            <Text style={[styles.timeValue, TabularNums]}>{format(timeAsDate, 'hh:mm a')}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustTime(-5)} activeOpacity={0.75}>
              <MaterialCommunityIcons name="minus" size={16} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustTime(5)} activeOpacity={0.75}>
              <MaterialCommunityIcons name="plus" size={16} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {errors.punchTime && <Text style={styles.errorText}>{errors.punchTime.message}</Text>}

          {/* ─── Reason ─── */}
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, value, onBlur } }) => (
              <TextArea
                label="DETAILED REASON"
                placeholder="Why was this punch missed?"
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
          <Button
            title="Submit Regularization Request"
            onPress={handleSubmit(onSubmit)}
            loading={submit.isPending}
            disabled={workflowOff(missingPunchFlow)}
            style={{ marginTop: 4 }}
          />
          <TouchableOpacity style={styles.discardBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.discardBtnText}>Discard Draft</Text>
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 12, letterSpacing: 0.2 },
  brandSub: { color: Colors.textMuted, fontSize: 7.5, fontWeight: '700', letterSpacing: 0.6 },

  content: { padding: 16, paddingBottom: 40 },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 22 },
  subtitle: { color: Colors.textMuted, fontSize: 12.5, marginTop: 2, marginBottom: 16 },

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
  slotTargetActive: { color: 'rgba(255,255,255,0.75)' },

  timeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12,
    marginBottom: 4,
    ...cardShadow,
  },
  timeIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.bgSurfaceLow, alignItems: 'center', justifyContent: 'center' },
  timeValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 20 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.bgSurfaceLow, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  errorText: { color: Colors.error, fontSize: 12, marginTop: 4, marginBottom: 10, marginLeft: 4 },

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

  discardBtn: { alignItems: 'center', paddingVertical: 14 },
  discardBtnText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
});
