import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  StatusBar,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { KeyboardAvoider, useKeyboardVisible } from '../../src/components/KeyboardAvoider';
import { FormScrollView } from '../../src/components/FormScrollView';
import { Input } from '../../src/components/ui/Input';
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

export default function LoginScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { setUser } = useAuth();
  const keyboardVisible = useKeyboardVisible();
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <View pointerEvents="none" style={styles.decorWrap}>
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
      </View>

      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView
          contentContainerStyle={[styles.container, keyboardVisible && styles.containerKeyboard]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={styles.logoSection}>
            <View style={styles.brandLogo}>
              <UKTLogo size={72} />
            </View>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>UK</Text>
              <Text style={styles.brandTail}> TEXTILES</Text>
            </View>
            <Text style={styles.tagline}>EMPLOYEE PORTAL</Text>

            <View style={styles.versionPill}>
              <View style={styles.versionDot} />
              <Text style={styles.versionText}>Employee Portal {APP_VERSION_LABEL}</Text>
            </View>
          </View>

          {/* Welcome */}
          <Text style={styles.heading}>Welcome Back</Text>
          <Text style={styles.subheading}>
            Sign in to access your attendance, leave, salary slips and more.
          </Text>

          {/* Form card */}
          <View style={styles.card}>
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
                    <Input
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
                    <Input
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

                <TouchableOpacity style={styles.signInBtn} onPress={handleSubmit(onSubmit)} disabled={loading} activeOpacity={0.85}>
                  <LinearGradient colors={Colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.signInGradient}>
                    <Text style={styles.signInText}>{loading ? 'Signing In…' : 'Sign In to Dashboard'}</Text>
                    {!loading && <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {canSwitch && (
              <TouchableOpacity onPress={() => setMode(showOtp ? 'password' : 'otp')} style={styles.switchRow} activeOpacity={0.8}>
                <MaterialCommunityIcons name={showOtp ? 'lock-outline' : 'whatsapp'} size={16} color={Colors.primary} />
                <Text style={styles.switchText}>
                  {showOtp ? 'Use my password instead' : 'Sign in with a WhatsApp code'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => router.push('/(auth)/set-password')} style={styles.firstTimeRow} activeOpacity={0.8}>
              <View style={styles.firstTimeIcon}>
                <MaterialCommunityIcons name="key-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.firstTimeTitle}>First time at UKTextiles?</Text>
                <Text style={styles.firstTimeSub}>Activate your account & set your password</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

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
        </FormScrollView>
      </KeyboardAvoider>

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
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 4 },
  containerKeyboard: { justifyContent: 'flex-start', paddingBottom: 32 },
  decorWrap: { position: 'absolute', top: -40, right: -30, zIndex: 0 },
  decorCircle1: { width: 180, height: 180, borderRadius: 90, backgroundColor: Colors.primaryFixed, opacity: 0.5 },
  decorCircle2: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.secondaryFixed, opacity: 0.6,
    position: 'absolute', bottom: -10, right: 30,
  },

  logoSection: { alignItems: 'center', gap: 8, zIndex: 1, marginBottom: 20 },
  brandLogo: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'baseline' },
  brand: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 26, letterSpacing: 0.3 },
  brandTail: { color: Colors.primary, fontFamily: FontFamily.displayBold, fontSize: 26, letterSpacing: 0.3 },
  tagline: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginTop: 2 },
  versionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginTop: 12,
  },
  versionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.statusGreen },
  versionText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },

  heading: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 24, textAlign: 'center', marginBottom: 6 },
  subheading: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22, paddingHorizontal: 8 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 22,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15 },
      android: { elevation: 8 },
    }),
  },
  passwordLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginLeft: 4 },
  passwordLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  forgotLink: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },

  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rememberText: { color: Colors.textSecondary, fontSize: 13 },

  signInBtn: { borderRadius: BorderRadius.full, overflow: 'hidden', marginBottom: 14 },
  signInGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15,
  },
  signInText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 15 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 6 },
  switchText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },

  firstTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  firstTimeIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
  },
  firstTimeTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  firstTimeSub: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },

  serverCard: { marginTop: 14 },
  helpRow: { alignItems: 'center', paddingVertical: 16 },
  helpText: { color: Colors.textMuted, fontSize: 13 },
  helpAccent: { color: Colors.primary, fontFamily: FontFamily.bodySemibold },

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
  errTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 17 },
  errSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  errInfoBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.lg, padding: 12 },
  errInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  errInfoLabel: { color: Colors.textMuted, fontSize: 12.5, flexShrink: 1 },
  errInfoPill: { backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  errInfoPillText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  errMessage: { color: Colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  errRetryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.statusRed,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
  },
  errRetryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
  errHelpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  errHelpText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
});
