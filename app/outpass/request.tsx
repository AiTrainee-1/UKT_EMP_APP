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
import { useEmployee } from '../../src/hooks/useEmployee';
import { useOutpassRequests, useSubmitOutpassRequest, OUTPASS_PASS_TYPE_LABEL, type OutpassPassType } from '../../src/hooks/useOutpass';
import { Avatar } from '../../src/components/ui/Avatar';
import { Input } from '../../src/components/ui/Input';
import { TextArea } from '../../src/components/ui/TextArea';
import { Button } from '../../src/components/ui/Button';
import { TimePickerField } from '../../src/components/ui/DatePickerField';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const now = new Date();
const defaultReturnTime = format(new Date(now.getTime() + 2 * 60 * 60 * 1000), 'HH:mm');

const PASS_TYPES: { value: OutpassPassType; icon: string; hint: string }[] = [
  { value: 'official', icon: 'briefcase-outline', hint: 'Client visit, sampling, delivery or bank courier' },
  { value: 'personal', icon: 'account-alert-outline', hint: 'Medical, urgent domestic errand or family emergency' },
  { value: 'early_dismissal', icon: 'exit-run', hint: 'Authorized departure before standard shift completion' },
];

const schema = z.object({
  passType: z.string().min(1, 'Select a pass type'),
  destination: z.string().min(2, 'Please enter where you are going'),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(300, 'Reason is too long (max 300 characters)'),
  expectedReturnTime: z.string().min(1, 'Expected return time is required'),
});
type FormData = z.infer<typeof schema>;

export default function RequestGateOutpassScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data: requests } = useOutpassRequests(user?.employeeId ?? null);
  const submit = useSubmitOutpassRequest(user?.employeeId ?? null);

  const [showSuccess, setShowSuccess] = React.useState(false);
  const [toast, setToast] = React.useState({ message: '', type: 'error' as 'success' | 'error', visible: false });

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { passType: 'official', destination: '', reason: '', expectedReturnTime: defaultReturnTime },
  });

  const usedThisMonth = (requests ?? []).filter((r) => {
    const d = new Date(r.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && r.status !== 'rejected';
  }).length;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (form: FormData) => {
    try {
      const [h, m] = form.expectedReturnTime.split(':').map(Number);
      const expectedReturn = new Date();
      expectedReturn.setHours(h, m, 0, 0);
      await submit.mutateAsync({
        destination: form.destination,
        reason: form.reason,
        passType: form.passType as OutpassPassType,
        expectedReturnAt: expectedReturn.toISOString(),
      });
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
          <Text style={styles.headerTitle}>Request Gate Outpass</Text>
          <Text style={styles.headerSubtitle}>Factory Gate Exit Authorization</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Employee card */}
          <View style={styles.empCard}>
            <Avatar uri={employee?.photoUrl} name={employee?.name ?? user?.name} size={40} borderColor={Colors.border} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.empName}>{employee?.name ?? user?.name}</Text>
                <View style={styles.empCodePill}>
                  <Text style={styles.empCodePillText}>{employee?.employeeCode}</Text>
                </View>
              </View>
              <Text style={styles.empMeta} numberOfLines={1}>
                {employee?.departmentName ?? employee?.designationTitle}
              </Text>
            </View>
            <View style={styles.usedPill}>
              <Text style={styles.usedPillText}>{usedThisMonth} this month</Text>
            </View>
          </View>

          {/* Pass classification */}
          <Text style={styles.sectionLabel}>PASS CLASSIFICATION</Text>
          <Controller
            control={control}
            name="passType"
            render={({ field: { onChange, value } }) => (
              <View style={{ gap: 8, marginBottom: 18 }}>
                {PASS_TYPES.map((t) => {
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
                        <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{OUTPASS_PASS_TYPE_LABEL[t.value]}</Text>
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
          {errors.passType && <Text style={styles.errorText}>{errors.passType.message}</Text>}

          {/* Destination */}
          <Controller
            control={control}
            name="destination"
            render={({ field: { onChange, value, onBlur } }) => (
              <Input
                label="Destination / Facility Name"
                placeholder="Where are you going?"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.destination?.message}
                leftIconName="map-marker-outline"
              />
            )}
          />

          {/* Expected return */}
          <Controller
            control={control}
            name="expectedReturnTime"
            render={({ field: { onChange, value } }) => (
              <TimePickerField label="Expected Return Time" value={value} onChange={onChange} error={errors.expectedReturnTime?.message} />
            )}
          />

          {/* Reason */}
          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, value, onBlur } }) => (
              <TextArea
                label="PURPOSE & EXIT JUSTIFICATION"
                placeholder="Describe your reason for leaving the premises..."
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                minLength={5}
                maxLength={300}
                error={errors.reason?.message}
              />
            )}
          />

          <View style={styles.noteCard}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
            <Text style={styles.noteText}>
              Your Department Head or HR reviews this request — once approved, a scannable QR pass is generated and
              valid for 60 minutes from approval.
            </Text>
          </View>

          <Button title="Submit Outpass Request" onPress={handleSubmit(onSubmit)} loading={submit.isPending} style={{ marginTop: 4 }} />
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message="Your outpass request has been sent for approval."
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
  empMeta: { color: Colors.textMuted, fontSize: 11.5, marginTop: 3 },
  usedPill: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5 },
  usedPillText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700', ...TabularNums },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },

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
