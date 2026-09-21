import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions, useSubmitPermission, type PermissionDurationMinutes } from '../../src/hooks/useRequests';
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

const now = new Date();
const todayStr = format(now, 'yyyy-MM-dd');

const PERMISSION_TYPES: { key: 'Late Check-In' | 'Early Check-Out' | 'Mid-Shift Short Leave'; value: 'Late In' | 'Early Out' | 'Short Leave'; icon: string; hint: string }[] = [
  { key: 'Late Check-In', value: 'Late In', icon: 'login', hint: 'Arriving after shift start' },
  { key: 'Early Check-Out', value: 'Early Out', icon: 'logout', hint: 'Leaving before shift close' },
  { key: 'Mid-Shift Short Leave', value: 'Short Leave', icon: 'swap-horizontal', hint: 'Out & back within shift' },
];

const DURATIONS: PermissionDurationMinutes[] = [30, 45, 60, 90];

const schema = z.object({
  type: z.string().min(1, 'Select a permission type'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(200, 'Reason is too long (max 200 characters)'),
});
type FormData = z.infer<typeof schema>;

export default function NewPermissionRequestScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const { data } = usePermissions(user?.employeeId ?? null, month, year);
  const submit = useSubmitPermission(user?.employeeId ?? null);

  const [showSuccess, setShowSuccess] = React.useState(false);
  const [toast, setToast] = React.useState({ message: '', type: 'error' as 'success' | 'error', visible: false });

  const { control, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'Late In', date: todayStr, time: '09:30', durationMinutes: 30, reason: '' },
  });

  const monthlyUsed = data?.monthlyUsed ?? 0;
  const monthlyLimit = data?.monthlyLimit ?? 3;
  const remaining = Math.max(0, monthlyLimit - monthlyUsed);
  const progress = monthlyLimit > 0 ? Math.min(1, monthlyUsed / monthlyLimit) : 0;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (form: FormData) => {
    try {
      await submit.mutateAsync(form);
      setShowSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit. Please try again.';
      showToast(msg, 'error');
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Monthly Allowance */}
          <View style={styles.allowanceCard}>
            <View style={styles.allowanceTopRow}>
              <View>
                <Text style={styles.allowanceTitle}>Monthly Allowance</Text>
                <Text style={styles.allowanceSub}>{monthlyLimit} Permissions this cycle</Text>
              </View>
              <View style={styles.usedPill}>
                <Text style={styles.usedPillText}>Used: {monthlyUsed} of {monthlyLimit}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.remainingText}>{remaining} Remaining</Text>
          </View>

          {/* Permission type */}
          <Text style={styles.sectionLabel}>SELECT PERMISSION TYPE</Text>
          <Controller
            control={control}
            name="type"
            render={({ field: { onChange, value } }) => (
              <View style={{ gap: 8, marginBottom: 18 }}>
                {PERMISSION_TYPES.map((t) => {
                  const active = value === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.typeCard, active && styles.typeCardActive]}
                      onPress={() => onChange(t.value)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.typeIconWrap, active && styles.typeIconWrapActive]}>
                        <MaterialCommunityIcons name={t.icon as any} size={17} color={active ? '#fff' : Colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{t.key}</Text>
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
              <DatePickerField label="Date of Permission" value={value} onChange={onChange} error={errors.date?.message} />
            )}
          />
          <Controller
            control={control}
            name="time"
            render={({ field: { onChange, value } }) => (
              <TimePickerField label="Expected Time" value={value} onChange={onChange} error={errors.time?.message} />
            )}
          />

          <Text style={styles.fieldLabel}>Duration Requested</Text>
          <Controller
            control={control}
            name="durationMinutes"
            render={({ field: { onChange, value } }) => (
              <View style={styles.durationRow}>
                {DURATIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.durationChip, value === d && styles.durationChipActive]}
                    onPress={() => onChange(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.durationChipText, value === d && styles.durationChipTextActive]}>
                      {d} m{d === 90 ? ' (Max)' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />

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
              Every employee gets {monthlyLimit} free permissions a month. Additional requests beyond that may incur a
              proportional shift deduction — HR reviews and approves each request.
            </Text>
          </View>

          <Button title="Submit Permission Request" onPress={handleSubmit(onSubmit)} loading={submit.isPending} style={{ marginTop: 4 }} />
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>Cancel Request</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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
  usedPill: { backgroundColor: Colors.badgeRedBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  usedPillText: { color: Colors.statusRed, fontSize: 10.5, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSurfaceLow, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  remainingText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },

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
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  durationChip: { backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 9 },
  durationChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  durationChipText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  durationChipTextActive: { color: '#fff' },

  noteCard: {
    flexDirection: 'row', gap: 8,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginTop: 8,
    marginBottom: 18,
  },
  noteText: { flex: 1, color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16 },

  errorText: { color: Colors.error, fontSize: 12, marginBottom: 8, marginTop: -4 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelBtnText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
});
