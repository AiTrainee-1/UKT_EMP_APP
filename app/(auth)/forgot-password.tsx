import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { KeyboardAvoider, useKeyboardVisible } from '../../src/components/KeyboardAvoider';
import { FormScrollView } from '../../src/components/FormScrollView';
import { Input } from '../../src/components/ui/Input';
import { Toast } from '../../src/components/ui/Toast';
import { OtpFlow } from '../../src/components/auth/OtpFlow';
import { SupportContactCard } from '../../src/components/support/SupportContactCard';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { loginOptionsRequest, otpResetPasswordRequest } from '../../src/hooks/useAuth';

/** Forgot / reset password: a WhatsApp code proves it's really you, then choose a new password. */
export default function ForgotPasswordScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const keyboardVisible = useKeyboardVisible();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // null until the server answers; if it can't, try anyway and let the request report the problem.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  useEffect(() => {
    loginOptionsRequest()
      .then((o) => setAvailable(o.otpReset))
      .catch(() => setAvailable(true));
  }, []);

  const mismatch = confirm.length > 0 && password !== confirm;
  const passwordsOk = password.length >= 8 && password === confirm;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView
          contentContainerStyle={[styles.container, keyboardVisible && styles.containerKeyboard]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backChip} activeOpacity={0.8}>
              <MaterialCommunityIcons name="arrow-left" size={15} color={Colors.primary} />
              <Text style={styles.backChipText}>Back to Login</Text>
            </TouchableOpacity>
            <View style={styles.pill}>
              <MaterialCommunityIcons name="whatsapp" size={12} color={Colors.primary} />
              <Text style={styles.pillText}>RESET WITH WHATSAPP</Text>
            </View>
          </View>

          <Text style={styles.heading}>Forgot your password?</Text>
          <Text style={styles.sub}>
            Enter your employee code and we will WhatsApp you a code. Enter it here to choose a new password.
          </Text>

          <View style={styles.card}>
            {available === false ? (
              <View>
                <View style={styles.noticeBox}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={Colors.statusRed} />
                  <Text style={styles.noticeText}>
                    Resetting with WhatsApp is not available right now. Please ask HR to reset your password, or set
                    one up if you have never had one.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(auth)/set-password')} style={styles.linkRow}>
                  <Text style={styles.linkAccent}>Set up my password</Text>
                </TouchableOpacity>
                <SupportContactCard situation="hr" compact style={styles.hrCard} />
              </View>
            ) : (
              <OtpFlow
                purpose="reset"
                submitLabel="Set new password"
                extraValid={passwordsOk}
                extraFields={
                  <View>
                    <Input
                      label="New password"
                      placeholder="Min. 8 characters"
                      value={password}
                      onChangeText={setPassword}
                      isPassword
                      returnKeyType="next"
                      leftIconName="lock-outline"
                      containerStyle={{ marginBottom: 10 }}
                    />
                    <Input
                      label="Confirm password"
                      placeholder="Re-enter new password"
                      value={confirm}
                      onChangeText={setConfirm}
                      isPassword
                      returnKeyType="done"
                      error={mismatch ? 'Passwords do not match' : undefined}
                      leftIconName="shield-check-outline"
                      rightIcon={
                        passwordsOk ? (
                          <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                        ) : undefined
                      }
                    />
                  </View>
                }
                onSubmit={async (identifier, otp) => {
                  await otpResetPasswordRequest(identifier, otp, password);
                  setToast({ message: 'Password updated. You can now sign in.', visible: true });
                  setTimeout(() => router.replace('/(auth)/login'), 1500);
                }}
              />
            )}
          </View>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.link}>
            <Text style={styles.linkText}>
              Remembered it? <Text style={styles.linkAccent}>Sign In →</Text>
            </Text>
          </TouchableOpacity>
        </FormScrollView>
      </KeyboardAvoider>

      <Toast message={toast.message} type="success" visible={toast.visible} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    container: { flexGrow: 1, padding: 20, paddingTop: 16, gap: 4 },
    containerKeyboard: { paddingBottom: 32 },

    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    backChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.primaryFixed,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    backChipText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: Colors.primaryFixed,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    pillText: { color: Colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

    heading: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 26, marginBottom: 6 },
    sub: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 18 },

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

    noticeBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: Colors.badgeRedBg,
      borderRadius: BorderRadius.md,
      padding: 12,
      marginBottom: 6,
    },
    noticeText: { flex: 1, color: Colors.badgeRedText, fontSize: 13, lineHeight: 18 },

    hrCard: { marginTop: 8 },
    link: { alignItems: 'center', paddingVertical: 10 },
    linkRow: { alignItems: 'center', paddingVertical: 10 },
    linkText: { color: Colors.textMuted, fontSize: 13 },
    linkAccent: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  });
