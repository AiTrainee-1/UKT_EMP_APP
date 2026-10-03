import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Toast } from '../../src/components/ui/Toast';
import { AuthShell } from '../../src/components/auth/AuthShell';
import { AuthInput } from '../../src/components/auth/AuthInput';
import { AuthButton } from '../../src/components/auth/AuthButton';
import { AuthColors, AuthFont } from '../../src/components/auth/authTheme';
import { OtpFlow } from '../../src/components/auth/OtpFlow';
import { SupportContactCard } from '../../src/components/support/SupportContactCard';
import { SupportInlineLink } from '../../src/components/support/SupportInlineLink';
import { UKTLogo } from '../../src/components/UKTLogo';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/hooks/useAuth';
import { APP_VERSION_LABEL } from '../../src/lib/appVersion';
import { isServerProblem } from '../../src/lib/supportContact';
import { loginRequest, loginOptionsRequest, otpLoginRequest, type LoginOptions } from '../../src/hooks/useAuth';

const schema = z.object({
  identifier: z.string().min(1, 'Employee Code is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

const REMEMBER_KEY = 'uktex.rememberedIdentifier';

// What the portal is for, shown on the header (the company details part of the design).
const FEATURES: { icon: string; label: string }[] = [
  { icon: 'calendar-check-outline', label: 'Attendance' },
  { icon: 'clock-outline', label: 'Duty shifts' },
  { icon: 'umbrella-outline', label: 'Leave' },
  { icon: 'cash-multiple', label: 'Salary slips' },
];

export default function LoginScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '',
    type: 'error',
    visible: false,
  });
  const [authError, setAuthError] = useState<{ identifier: string; message: string } | null>(null);
  // The last sign-in attempt got no answer from the server (or a 5xx): show the software-support contact.
  const [serverDown, setServerDown] = useState(false);
  const [rememberedCode, setRememberedCode] = useState('');
  // Which sign-in methods the server offers. Until it answers (or if it can't), password sign-in works as before.
  const [options, setOptions] = useState<LoginOptions | null>(null);
  const [mode, setMode] = useState<'otp' | 'password'>('password');
  const showOtp = mode === 'otp' && options?.otpLogin === true;
  const canSwitch = options?.otpLogin === true && options.passwordLogin;

  const { control, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Prefills the employee code from the last login when "Keep roll saved on
  // device" was checked — never the password, which is never persisted.
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then((saved) => {
      if (saved) {
        setValue('identifier', saved);
        setRememberedCode(saved);
      }
    });
  }, [setValue]);

  useEffect(() => {
    loginOptionsRequest()
      .then((o) => {
        setOptions(o);
        setMode(o.otpLogin ? 'otp' : 'password');
      })
      .catch(() => {});
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  // Both the password and the WhatsApp-code sign-in end the same way.
  const finishSignIn = async (
    identifier: string,
    result: { employeeId: number; name: string; role: string },
  ) => {
    await AsyncStorage.setItem(REMEMBER_KEY, remember ? identifier : '');
    setUser({ employeeId: result.employeeId, name: result.name, role: result.role });
    router.replace('/(tabs)/home');
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setServerDown(false);
    try {
      const result = await loginRequest(data.identifier, data.password);
      await finishSignIn(data.identifier, result);
    } catch (err: any) {
      // Backend error responses are always { error: "..." } (see views.py::_error)
      // — .detail/.message never exist, so checking only those silently
      // discarded the real reason (wrong password vs unregistered vs no
      // password set yet vs an unrelated server error) and always showed
      // this same generic fallback.
      // The server not working (unreachable, timed out, or a 5xx) is not a
      // rejected sign-in: say so, and offer the software-support contact
      // right on the screen (the toast alone is gone in three seconds).
      const serverProblem = isServerProblem(err);
      const msg = serverProblem
        ? (err?.response
            ? 'The server is not responding properly right now. Please try again in a few minutes.'
            : 'Could not reach the server. Check your connection and try again.')
        : err?.response?.data?.error || err?.response?.data?.detail || err?.response?.data?.message ||
          'Invalid credentials. Please try again.';
      // A response that came back from the server is a real authentication
      // rejection (wrong password, unknown code, etc.) — that gets the
      // fuller "Authentication Failed" modal. A request that never reached
      // the server (offline, timeout) stays a lightweight toast instead.
      if (serverProblem) {
        setServerDown(true);
        showToast(msg, 'error');
      } else if (err?.response) {
        setAuthError({ identifier: data.identifier, message: msg });
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <View>
      <View style={styles.brandRow}>
        <UKTLogo size={34} />
        <View style={styles.brandText}>
          <Text style={styles.brandName}>UK TEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
        <View style={styles.versionPill}>
          <View style={styles.versionDot} />
          <Text style={styles.versionText}>{APP_VERSION_LABEL}</Text>
        </View>
      </View>

      <Text style={styles.headline}>Log in to stay on top of your tasks and attendance.</Text>
      <Text style={styles.headSub}>
        Access your attendance, duty shifts, leave approvals & salary slips seamlessly.
      </Text>

      <View style={styles.featureRow}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.featureChip}>
            <MaterialCommunityIcons name={f.icon as any} size={13} color="#fff" />
            <Text style={styles.featureText}>{f.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <>
      <AuthShell header={header}>
        <Text style={styles.title}>Login</Text>
        <View style={styles.activateRow}>
          <Text style={styles.activateText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/set-password')} hitSlop={8}>
            <Text style={styles.activateLink}>Activate</Text>
          </TouchableOpacity>
        </View>

        {showOtp ? (
          <OtpFlow
            purpose="login"
            submitLabel="Verify & Sign In"
            initialIdentifier={rememberedCode}
            onSubmit={async (identifier, otp) => {
              const result = await otpLoginRequest(identifier, otp);
              await finishSignIn(identifier, result);
            }}
          />
        ) : (
          <>
            <Controller
              control={control}
              name="identifier"
              render={({ field: { onChange, value, onBlur } }) => (
                <AuthInput
                  label="Employee Code"
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

            <View style={styles.passwordLabelRow}>
              <Text style={styles.passwordLabel}>Password</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text style={styles.forgotLink}>Forgot?</Text>
              </TouchableOpacity>
            </View>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value, onBlur } }) => (
                <AuthInput
                  placeholder="Enter your password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  isPassword
                  error={errors.password?.message}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  leftIconName="lock-outline"
                  containerStyle={{ marginBottom: 12 }}
                />
              )}
            />

            <TouchableOpacity style={styles.rememberRow} onPress={() => setRemember(v => !v)} activeOpacity={0.75}>
              <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
                {remember && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
              </View>
              <Text style={styles.rememberText}>Keep roll saved on device</Text>
            </TouchableOpacity>

            <AuthButton
              title="Sign In to Dashboard"
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              style={styles.signIn}
            />
          </>
        )}

        {canSwitch && (
          <TouchableOpacity onPress={() => setMode(showOtp ? 'password' : 'otp')} style={styles.switchRow} activeOpacity={0.8}>
            <MaterialCommunityIcons name={showOtp ? 'lock-outline' : 'whatsapp'} size={16} color={AuthColors.accentDark} />
            <Text style={styles.switchText}>
              {showOtp ? 'Use my password instead' : 'Sign in with a WhatsApp code'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>NEW JOINING</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/set-password')} style={styles.firstTimeRow} activeOpacity={0.8}>
          <View style={styles.firstTimeIcon}>
            <MaterialCommunityIcons name="key-outline" size={18} color={AuthColors.accentDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.firstTimeTitle}>First time at UKTextiles?</Text>
            <Text style={styles.firstTimeSub}>Activate your account & set your password</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {serverDown && (
          <SupportContactCard
            situation="server"
            compact
            description="The server is not responding, so nobody can sign in right now. If it stays like this, contact:"
            style={styles.serverCard}
          />
        )}

        <SupportInlineLink
          situation="hr"
          prefix="Need help? "
          style={styles.helpRow}
          textStyle={styles.helpText}
          accentStyle={styles.helpAccent}
        />
      </AuthShell>

      <Toast {...toast} />

      <Modal visible={!!authError} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAuthError(null)}>
        <View style={styles.errBackdrop}>
          <MotiView
            from={{ opacity: 0, scale: 0.9, translateY: 10 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 200 }}
            style={styles.errCard}
          >
            <View style={styles.errHeaderRow}>
              <View style={styles.errIconWrap}>
                <MaterialCommunityIcons name="lock-alert-outline" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.errTitle}>Authentication Failed</Text>
                <Text style={styles.errSubtitle}>Security System Notice</Text>
              </View>
              <TouchableOpacity onPress={() => setAuthError(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.errInfoBox}>
              <View style={styles.errInfoRow}>
                <Text style={styles.errInfoLabel}>Attempted Employee Code</Text>
                <View style={styles.errInfoPill}>
                  <Text style={styles.errInfoPillText}>{authError?.identifier}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.errMessage}>{authError?.message}</Text>

            <TouchableOpacity style={styles.errRetryBtn} onPress={() => setAuthError(null)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="reload" size={17} color="#fff" />
              <Text style={styles.errRetryText}>Try Again</Text>
            </TouchableOpacity>

            <SupportInlineLink
              situation="hr"
              lead="Contact HR"
              showIcon
              iconColor={AuthColors.accentDark}
              style={styles.errHelpRow}
              textStyle={styles.errHelpText}
            />
          </MotiView>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  // ── header (on the emerald backdrop) ──
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  brandText: { flex: 1 },
  brandName: { color: '#fff', fontFamily: AuthFont.display, fontSize: 15, letterSpacing: 0.8 },
  brandSub: { color: 'rgba(255,255,255,0.78)', fontFamily: AuthFont.bodyBold, fontSize: 9.5, letterSpacing: 1.6, marginTop: 1 },
  versionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  versionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5EEAD4' },
  versionText: { color: '#fff', fontFamily: AuthFont.bodyBold, fontSize: 11 },

  headline: { color: '#fff', fontFamily: AuthFont.display, fontSize: 27, lineHeight: 35, letterSpacing: -0.3 },
  headSub: { color: 'rgba(255,255,255,0.86)', fontFamily: AuthFont.body, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  featureChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  featureText: { color: '#fff', fontFamily: AuthFont.bodySemi, fontSize: 11.5 },

  // ── sheet ──
  title: { color: Colors.textPrimary, fontFamily: AuthFont.display, fontSize: 25, textAlign: 'center' },
  activateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 22 },
  activateText: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 13 },
  activateLink: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 13 },

  passwordLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, marginLeft: 2 },
  passwordLabel: { color: Colors.textSecondary, fontFamily: AuthFont.bodyBold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  forgotLink: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 12.5 },

  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: AuthColors.accent, borderColor: AuthColors.accent },
  rememberText: { color: Colors.textSecondary, fontFamily: AuthFont.body, fontSize: 13 },

  signIn: { marginBottom: 6 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  switchText: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 13.5 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.outlineVariant },
  dividerText: { color: Colors.textMuted, fontFamily: AuthFont.bodyBold, fontSize: 10.5, letterSpacing: 1.4 },

  firstTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: AuthColors.accentSoft,
    borderRadius: 18,
    padding: 13,
  },
  firstTimeIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  firstTimeTitle: { color: '#0F2F2C', fontFamily: AuthFont.bodyBold, fontSize: 13.5 },
  firstTimeSub: { color: '#4B6663', fontFamily: AuthFont.body, fontSize: 11.5, marginTop: 1 },

  serverCard: { marginTop: 14 },
  helpRow: { alignItems: 'center', paddingTop: 22, paddingBottom: 4 },
  helpText: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 13 },
  helpAccent: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold },

  // ── "Authentication Failed" notice ──
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
  errIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.statusRed, alignItems: 'center', justifyContent: 'center' },
  errTitle: { color: Colors.textPrimary, fontFamily: AuthFont.display, fontSize: 17 },
  errSubtitle: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 11.5, marginTop: 2 },
  errInfoBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.lg, padding: 12 },
  errInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  errInfoLabel: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 12.5, flexShrink: 1 },
  errInfoPill: { backgroundColor: AuthColors.accentSoft, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  errInfoPillText: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 12 },
  errMessage: { color: Colors.textSecondary, fontFamily: AuthFont.body, fontSize: 13.5, lineHeight: 19 },
  errRetryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.statusRed,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
  },
  errRetryText: { color: '#fff', fontFamily: AuthFont.displaySemi, fontSize: 14.5 },
  errHelpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  errHelpText: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 12.5 },
});
