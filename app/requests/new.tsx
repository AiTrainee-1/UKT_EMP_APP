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
import { usePermissions, useSubmitPermission } from '../../src/hooks/useRequests';
import { useShiftStats, permissionLimitFromStats } from '../../src/hooks/useShiftStats';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { pipelineSentence, workflowOff } from '../../src/lib/approval';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { checkRequestDate } from '../../src/lib/requestWindow';
import { monthOfDate, requestPickerLimits } from '../../src/lib/requestWindowForm';
import {
  PERMISSION_DURATION_LABEL,
  PERMISSION_TYPE_OPTIONS,
  capRulesKnown,
  permissionSubmitError,
  resolvePermissionLimit,
} from '../../src/lib/permissions';
import { TextArea } from '../../src/components/ui/TextArea';
import { Button } from '../../src/components/ui/Button';
import { DatePickerField, TimePickerField } from '../../src/components/ui/DatePickerField';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

// `type` holds the WIRE value of PERMISSION_TYPE_OPTIONS: the LEGACY spelling ("Late In" /
// "Early Out" / "Short Leave"), which the old backend requires and the new one accepts -only the
// on-screen labels changed. Every permission is a fixed hour, so there is no duration field.
const schema = z.object({
  type: z.string().min(1, 'Select a permission type'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(200, 'Reason is too long (max 200 characters)'),
});
type FormData = z.infer<typeof schema>;

export default function NewPermissionRequestScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // "Now" is read when the screen renders (and again at submit), never once at module load: the app process lives for
  // days, and the request window moves on the 1st-3rd of a month.
  const now = new Date();
  const limits = requestPickerLimits(now);

  const { user } = useAuth();
  const { data: shiftStats } = useShiftStats(now.getMonth() + 1, now.getFullYear());
  const submit = useSubmitPermission(user?.employeeId ?? null);
  // Who approves a permission, and whether HR has switched new ones off. Only a hint that may be a minute old: the
  // server refuses a new request either way and its message is shown (see onSubmit).
  const { data: approvalSummary } = useApprovalSummary();
  const permissionFlow = approvalSummary?.permission;

  const [showSuccess, setShowSuccess] = React.useState(false);
  const [toast, setToast] = React.useState({ message: '', type: 'error' as 'success' | 'error', visible: false });

  const { control, handleSubmit, watch, setValue, setError, clearErrors, formState: { errors, dirtyFields } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: PERMISSION_TYPE_OPTIONS[0].wire,
      date: limits.defaultDate,
      time: PERMISSION_TYPE_OPTIONS[0].defaultTime,
      reason: '',
    },
  });

  const selectedType = PERMISSION_TYPE_OPTIONS.find((t) => t.wire === watch('type')) ?? PERMISSION_TYPE_OPTIONS[0];

  // The server counts a permission in ITS OWN month, and on the 1st / 2nd the picked day can be in last month: so the
  // allowance card follows the picked day (this month while the date is empty) and says which month it is about.
  const picked = monthOfDate(watch('date'), now);
  const pickedMonthLabel = format(new Date(picked.year, picked.month - 1, 1), 'MMMM yyyy');
  const { data } = usePermissions(user?.employeeId ?? null, picked.month, picked.year);

  const monthlyUsed = data?.monthlyUsed ?? 0;
  // The company policy / shift-stats summary carry HR's limit on the new backend; the permission
  // list only once it has a row; the old backend's is 3.
  const monthlyLimit = resolvePermissionLimit(permissionLimitFromStats(shiftStats), data?.monthlyLimit);
  const remaining = Math.max(0, monthlyLimit - monthlyUsed);
  const progress = monthlyLimit > 0 ? Math.min(1, monthlyUsed / monthlyLimit) : 0;
  // Does the server speak the monthly-limit rules (Allowed / Overdue-Excess)? An older backend
  // sends no policy, cap or capStatus/statusLabel, and then the copy stays neutral rather than
  // asserting rules it cannot back.
  const capKnown = capRulesKnown({ policy: shiftStats?.policy, summary: shiftStats?.summary, items: data?.items });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (form: FormData) => {
    // The server is the authority (India time); this check, with "now" read at submit, only guides the employee.
    const dateMessage = checkRequestDate(form.date, new Date());
    if (dateMessage) {
      setError('date', { message: dateMessage });
      showToast(dateMessage, 'error');
      return;
    }
    try {
      await submit.mutateAsync(form);
      setShowSuccess(true);
    } catch (err: any) {
      // Server text wins (a 409 is a duplicate request for that day/type and carries its own message).
      const message = permissionSubmitError(err);
      // A refused date (code request_window_closed) is also marked under the date field.
      if (err?.response?.data?.code === 'request_window_closed') setError('date', { message });
      showToast(message, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>New Permission Request</Text>
          <Text style={styles.headerSubtitle}>Working Hour Adjustment</Text>
        </View>
      </View>

      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Monthly Allowance */}
          <View style={styles.allowanceCard}>
            <View style={styles.allowanceTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.allowanceTitle}>Monthly Allowance · {pickedMonthLabel}</Text>
                <Text style={styles.allowanceSub}>
                  {capKnown
                    ? `The first ${monthlyLimit} approved permissions each month are Allowed`
                    : `${monthlyLimit} permissions a month`}
                </Text>
              </View>
              <View style={[styles.usedPill, monthlyUsed >= monthlyLimit && styles.usedPillFull]}>
                <Text style={[styles.usedPillText, monthlyUsed >= monthlyLimit && styles.usedPillTextFull]}>
                  Used {monthlyUsed} of {monthlyLimit}
                </Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.remainingText}>
              {remaining > 0 ? `${remaining} Remaining` : 'Limit reached'}
            </Text>
            {capKnown && (
              <Text style={styles.allowanceExplain}>
                Permissions beyond the limit are Overdue / Excess: they do not protect the day and count toward late
                deductions.
              </Text>
            )}
          </View>

          {/* Permission type */}
          <Text style={styles.sectionLabel}>SELECT PERMISSION TYPE</Text>
          <Controller
            control={control}
            name="type"
            render={({ field: { onChange, value } }) => (
              <View style={{ gap: 8, marginBottom: 18 }}>
                {PERMISSION_TYPE_OPTIONS.map((t) => {
                  const active = value === t.wire;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.typeCard, active && styles.typeCardActive]}
                      onPress={() => {
                        onChange(t.wire);
                        // Start the time picker somewhere that makes sense for this type, unless
                        // the employee has already chosen a time themselves.
                        if (!dirtyFields.time) setValue('time', t.defaultTime);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.typeIconWrap, active && styles.typeIconWrapActive]}>
                        <MaterialCommunityIcons name={t.icon as any} size={17} color={active ? '#fff' : Colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{t.label}</Text>
                        <Text style={[styles.typeHint, active && styles.typeHintActive]}>{t.hint}</Text>
                      </View>
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active && <View style={styles.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          />
          {errors.type && <Text style={styles.errorText}>{errors.type.message}</Text>}

          {/* Schedule & duration */}
          <View style={styles.sectionHeaderRow}>
            <MaterialCommunityIcons name="calendar-clock-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionHeaderText}>Schedule & Duration</Text>
          </View>
          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, value } }) => (
              <DatePickerField
                label="Date of Permission"
                value={value}
                onChange={(v) => { onChange(v); clearErrors('date'); }}
                error={errors.date?.message}
                minDate={limits.minDate}
                maxDate={limits.maxDate}
                hint={limits.hint}
              />
            )}
          />
          <Controller
            control={control}
            name="time"
            render={({ field: { onChange, value } }) => (
              <TimePickerField label={selectedType.timeLabel} value={value} onChange={onChange} error={errors.time?.message} />
            )}
          />

          {/* Every permission is a fixed hour now -nothing to choose. */}
          <Text style={styles.fieldLabel}>Duration</Text>
          <View style={styles.durationFixed}>
            <MaterialCommunityIcons name="timer-outline" size={18} color={Colors.primary} />
            <Text style={styles.durationFixedText}>{PERMISSION_DURATION_LABEL}</Text>
            <Text style={styles.durationFixedTag}>Fixed</Text>
          </View>

          {/* Reason */}
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, value, onBlur } }) => (
              <TextArea
                label="REASON & DESCRIPTION"
                placeholder="Describe your reason for this permission..."
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                minLength={5}
                maxLength={200}
                error={errors.reason?.message}
              />
            )}
          />

          <View style={styles.noteCard}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
            <Text style={styles.noteText}>
              {pipelineSentence(permissionFlow)}
              {capKnown
                ? ' An Allowed Morning Late-In moves that day\'s shift start 1 hour later; an '
                  + 'Allowed Evening Early-Out moves the shift end 1 hour earlier; a Middle One-Hour Permission never '
                  + 'moves either.'
                : ''}
            </Text>
          </View>

          <WorkflowOffNote workflow={permissionFlow} style={styles.offNote} />
          <Button
            title="Submit Permission Request"
            onPress={handleSubmit(onSubmit)}
            loading={submit.isPending}
            disabled={workflowOff(permissionFlow)}
            style={{ marginTop: 4 }}
          />
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>Cancel Request</Text>
          </TouchableOpacity>
        </FormScrollView>
      </KeyboardAvoider>

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message="Your permission request has been sent for approval."
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
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

  content: { padding: 16, paddingBottom: 40 },

  allowanceCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
    gap: 8,
    ...cardShadow,
  },
  allowanceTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  allowanceTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  allowanceSub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  usedPill: { backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  usedPillText: { color: Colors.badgeBlueText, fontSize: 10.5, fontWeight: '800' },
  // At or over the limit: from here on an approved permission is Overdue / Excess.
  usedPillFull: { backgroundColor: Colors.badgeRedBg },
  usedPillTextFull: { color: Colors.statusRed },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSurfaceLow, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  remainingText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  allowanceExplain: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 },
  sectionHeaderText: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },

  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    padding: 12,
  },
  typeCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bgSurfaceLow, alignItems: 'center', justifyContent: 'center' },
  typeIconWrapActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  typeLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  typeLabelActive: { color: '#fff' },
  typeHint: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  typeHintActive: { color: 'rgba(255,255,255,0.75)' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.outlineVariant, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#fff' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },

  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 2 },
  durationFixed: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 18,
  },
  durationFixedText: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  durationFixedTag: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '800' },

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

  errorText: { color: Colors.error, fontSize: 12, marginBottom: 8, marginTop: -4 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelBtnText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
});
