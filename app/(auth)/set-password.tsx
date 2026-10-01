import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { KeyboardAvoider, useKeyboardVisible } from '../../src/components/KeyboardAvoider';
import { FormScrollView } from '../../src/components/FormScrollView';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { OtpFlow } from '../../src/components/auth/OtpFlow';
import { SupportContactCard } from '../../src/components/support/SupportContactCard';
import { SupportInlineLink } from '../../src/components/support/SupportInlineLink';
import { UKTLogo } from '../../src/components/UKTLogo';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { loginOptionsRequest, otpActivateRequest, setPasswordRequest } from '../../src/hooks/useAuth';
import { isServerProblem } from '../../src/lib/supportContact';

const schema = z
  .object({
    identifier: z.string().min(1, 'Employee Code is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

// Advisory only — the backend's actual rule is "8 characters minimum" (see
// schema above), which is what actually gates submission. These extra
// checks just help the employee choose a stronger password; failing them
// never blocks "Set Password & Activate".
const PASSWORD_RULES = [
  { label: 'At least 8 characters long', test: (p: string) => p.length >= 8 },
  { label: 'Includes uppercase & lowercase letters', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'Contains at least 1 number or special symbol', test: (p: string) => /[0-9\W]/.test(p) },
];

export default function SetPasswordScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const keyboardVisible = useKeyboardVisible();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });
  const [setupError, setSetupError] = useState<{ identifier: string; message: string } | null>(null);
  // The last attempt got no answer from the server (or a 5xx): show the software-support contact.
  const [serverDown, setServerDown] = useState(false);
  // Whether a WhatsApp code must confirm the employee first. null until the server answers; if it
  // can't be reached we assume yes - the code request itself then reports the connection problem.
  const [otpActivate, setOtpActivate] = useState<boolean | null>(null);
  const [otpStep, setOtpStep] = useState<1 | 2>(1);
  const [otpPassword, setOtpPassword] = useState('');
  const [otpConfirm, setOtpConfirm] = useState('');

  useEffect(() => {
    loginOptionsRequest()
      .then((o) => setOtpActivate(o.otpActivate))
      .catch(() => setOtpActivate(true));
  }, []);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const passwordValue = watch('password') ?? '';
  const confirmValue = watch('confirmPassword') ?? '';
  const passwordsMatch = !!confirmValue && confirmValue === passwordValue;
  const otpMismatch = otpConfirm.length > 0 && otpPassword !== otpConfirm;
  const otpPasswordsOk = otpPassword.length >= 8 && otpPassword === otpConfirm;

  const renderRules = (value: string) => (
    <View style={styles.rulesBox}>
      <Text style={styles.rulesTitle}>PASSWORD SECURITY RULES</Text>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <View key={rule.label} style={styles.ruleRow}>
            <MaterialCommunityIcons
              name={met ? 'check-circle' : 'circle-outline'}
              size={16}
              color={met ? Colors.statusGreen : Colors.outline}
            />
            <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setServerDown(false);
    try {
      await setPasswordRequest(data.identifier, data.password);
      showToast('Password set successfully! Please login.', 'success');
      setTimeout(() => router.replace('/(auth)/login'), 1500);
    } catch (err: any) {
      // The server not working (unreachable, timed out, or a 5xx) is not a
      // rejected employee code: say so and offer the software-support contact.
      const serverProblem = isServerProblem(err);
      const msg = serverProblem
        ? (err?.response
            ? 'The server is not responding properly right now. Please try again in a few minutes.'
            : 'Could not reach the server. Check your connection and try again.')
        : err?.response?.data?.error || err?.response?.data?.detail || err?.response?.data?.message || 'Failed to set password. Please try again.';
      // A response from the server means the employee code was genuinely
      // rejected (not found / already activated / token expired) — that
      // gets the fuller "Password Setup Failed" modal. A request that never
      // reached the server stays a lightweight toast instead.
      if (serverProblem) {
        setServerDown(true);
        showToast(msg, 'error');
      } else if (err?.response) {
        setSetupError({ identifier: data.identifier, message: msg });
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView
          contentContainerStyle={[styles.container, keyboardVisible && styles.containerKeyboard]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top row */}
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backChip} activeOpacity={0.8}>
              <MaterialCommunityIcons name="arrow-left" size={15} color={Colors.primary} />
              <Text style={styles.backChipText}>Back to Login</Text>
            </TouchableOpacity>
            <View style={styles.newAccountPill}>
              <View style={styles.newAccountDot} />
              <Text style={styles.newAccountText}>NEW ACCOUNT</Text>
            </View>
          </View>

          {/* Brand */}
          <View style={styles.brandRow}>
            <UKTLogo size={32} />
            <View>
              <Text style={styles.brandName}>UKTEXTILES</Text>
              <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
            </View>
          </View>

          <Text style={styles.heading}>Set Password</Text>
          <Text style={styles.sub}>
            {otpActivate === false
              ? 'First-time setup to activate your employee account.'
              : 'Confirm your WhatsApp number, then choose your password.'}
          </Text>

          {/* Step banner */}
          <View style={styles.stepBanner}>
            <View style={styles.stepIcon}>
              <MaterialCommunityIcons name="shield-check-outline" size={16} color="#fff" />
            </View>
            <Text style={styles.stepTitle}>
                {otpActivate === false
                  ? 'Verification & Credentials'
                  : otpStep === 1
                    ? 'Verify your WhatsApp number'
                    : 'Confirm code & set password'}
              </Text>
            <View style={{ flex: 1 }} />
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{otpActivate === false ? 'Step 1 of 1' : `Step ${otpStep} of 2`}</Text>
            </View>
          </View>

          {otpActivate === null && (
            <View style={[styles.card, styles.loadingCard]}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          )}

          {otpActivate === true && (
            <View style={styles.card}>
              <OtpFlow
                purpose="activate"
                submitLabel="Set Password & Activate"
                extraValid={otpPasswordsOk}
                onStepChange={setOtpStep}
                extraFields={
                  <View>
                    <Input
                      label="New Password"
                      placeholder="Min. 8 characters"
                      value={otpPassword}
                      onChangeText={setOtpPassword}
                      isPassword
                      returnKeyType="next"
                      leftIconName="lock-outline"
                      containerStyle={{ marginBottom: 6 }}
                    />
                    {renderRules(otpPassword)}
                    <Input
                      label="Confirm Password"
                      placeholder="Re-enter new password"
                      value={otpConfirm}
                      onChangeText={setOtpConfirm}
                      isPassword
                      returnKeyType="done"
                      error={otpMismatch ? 'Passwords do not match' : undefined}
                      leftIconName="shield-check-outline"
                      rightIcon={
                        otpPasswordsOk ? (
                          <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                        ) : undefined
                      }
                    />
                  </View>
                }
                onSubmit={async (identifier, otp) => {
                  await otpActivateRequest(identifier, otp, otpPassword);
                  showToast('Password set successfully! Please login.', 'success');
                  setTimeout(() => router.replace('/(auth)/login'), 1500);
                }}
              />
              <Text style={styles.footnoteCentered}>
                The code goes to the WhatsApp number HR has registered for you.
              </Text>
            </View>
          )}

          {otpActivate === false && (
            <View style={styles.card}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>Employee Code</Text>
                <Text style={styles.fieldHint}>On ID or offer letter</Text>
              </View>
              <Controller
                control={control}
                name="identifier"
                render={({ field: { onChange, value, onBlur } }) => (
                  <Input
                    placeholder="e.g. UKT-10482"
                    keyboardType="numeric"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.identifier?.message}
                    returnKeyType="next"
                    leftIconName="badge-account-outline"
                  />
                )}
              />
              {!errors.identifier && <Text style={styles.fieldFootnote}>Must match your HR registration record.</Text>}

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>New Password</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value, onBlur } }) => (
                  <Input
                    placeholder="Min. 8 characters"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    isPassword
                    error={errors.password?.message}
                    returnKeyType="next"
                    leftIconName="lock-outline"
                  />
                )}
              />

              {renderRules(passwordValue)}

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Confirm Password</Text>
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value, onBlur } }) => (
                  <Input
                    placeholder="Re-enter new password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    isPassword
                    error={errors.confirmPassword?.message}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit(onSubmit)}
                    leftIconName="shield-check-outline"
                    rightIcon={
                      passwordsMatch ? (
                        <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                      ) : undefined
                    }
                  />
                )}
              />
              {!errors.confirmPassword && <Text style={styles.fieldFootnote}>Must match the new password above.</Text>}

              <Button
                title="Set Password & Activate"
                onPress={handleSubmit(onSubmit)}
                loading={loading}
                icon={<MaterialCommunityIcons name="key-variant" size={16} color="#fff" />}
                style={styles.btn}
              />
              {serverDown && (
                <SupportContactCard
                  situation="server"
                  compact
                  description="The server is not responding, so your password could not be set. If it stays like this, contact:"
                  style={styles.serverCard}
                />
              )}
              <Text style={styles.footnoteCentered}>
                Once verified, your account will be activated and redirected to sign in.
              </Text>
            </View>
          )}

          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.link}>
            <Text style={styles.linkText}>
              Already activated your password? <Text style={styles.linkAccent}>Sign In →</Text>
            </Text>
          </TouchableOpacity>

          <SupportContactCard
            situation="hr"
            compact
            title="Employee Code not recognized?"
            description="Contact HR with your offer letter so they can check your employee code."
            style={styles.helpCard}
          />
        </FormScrollView>
      </KeyboardAvoider>

      <Toast {...toast} />

      <Modal visible={!!setupError} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSetupError(null)}>
        <View style={styles.errBackdrop}>
          <MotiView
            from={{ opacity: 0, scale: 0.9, translateY: 10 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 200 }}
            style={styles.errCard}
          >
            <View style={styles.errHeaderRow}>
              <View style={styles.errIconWrap}>
                <MaterialCommunityIcons name="shield-alert-outline" size={22} color={Colors.statusRed} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.errTitle}>Password Setup Failed</Text>
                <Text style={styles.errSubtitle}>Employee Code Not Recognized</Text>
              </View>
              <TouchableOpacity onPress={() => setSetupError(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.errInfoBox}>
              <Text style={styles.errInfoText}>
                The employee code <Text style={styles.errInfoBold}>{setupError?.identifier}</Text> — {setupError?.message}
              </Text>
            </View>

            <TouchableOpacity style={styles.errRetryBtn} onPress={() => setSetupError(null)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="reload" size={17} color="#fff" />
              <Text style={styles.errRetryText}>Retry Verification</Text>
            </TouchableOpacity>

            <SupportInlineLink
              situation="hr"
              lead="Contact HR"
              showIcon
              iconColor={Colors.primary}
              style={styles.errHelpRow}
              textStyle={styles.errHelpText}
            />
          </MotiView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  container: { flexGrow: 1, padding: 20, paddingTop: 16, gap: 4 },
  containerKeyboard: { paddingBottom: 32 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  backChipText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  newAccountPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  newAccountDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  newAccountText: { color: Colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15, letterSpacing: 0.3 },
  brandSub: { color: Colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  heading: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 26, marginBottom: 6 },
  sub: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 18 },

  stepBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 16,
  },
  stepIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  stepPill: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  stepPillText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },

  loadingCard: { alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15 },
      android: { elevation: 8 },
    }),
  },
  fieldHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  fieldHint: { color: Colors.textMuted, fontSize: 11 },
  fieldFootnote: { color: Colors.textMuted, fontSize: 11, marginTop: -6, marginBottom: 12, marginLeft: 4 },

  rulesBox: {
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    padding: 12,
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  rulesTitle: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { color: Colors.textSecondary, fontSize: 12.5 },
  ruleTextMet: { color: Colors.textPrimary, fontWeight: '600' },

  btn: { marginTop: 4 },
  footnoteCentered: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 16 },

  link: { alignItems: 'center', paddingVertical: 10 },
  linkText: { color: Colors.textMuted, fontSize: 13 },
  linkAccent: { color: Colors.primary, fontFamily: FontFamily.bodySemibold },

  // The HR contact card at the bottom of the screen, and the server one inside the form card.
  helpCard: { marginBottom: 20 },
  serverCard: { marginTop: 12 },

  errBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  errCard: {
    width: '100%', maxWidth: 340,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    padding: 20,
    gap: 14,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  errHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  errIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.badgeRedBg, alignItems: 'center', justifyContent: 'center' },
  errTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 17 },
  errSubtitle: { color: Colors.statusRed, fontSize: 12, fontWeight: '700', marginTop: 2 },
  errInfoBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.lg, padding: 12 },
  errInfoText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  errInfoBold: { color: Colors.textPrimary, fontWeight: '800' },
  errRetryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
  },
  errRetryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
  errHelpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  errHelpText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
});
