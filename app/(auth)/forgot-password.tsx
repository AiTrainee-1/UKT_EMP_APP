import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthShell } from '../../src/components/auth/AuthShell';
import { AuthInput } from '../../src/components/auth/AuthInput';
import { AuthColors, AuthFont } from '../../src/components/auth/authTheme';
import { Toast } from '../../src/components/ui/Toast';
import { OtpFlow } from '../../src/components/auth/OtpFlow';
import { SupportContactCard } from '../../src/components/support/SupportContactCard';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { loginOptionsRequest, otpResetPasswordRequest } from '../../src/hooks/useAuth';
import { APP_VERSION_LABEL } from '../../src/lib/appVersion';

/** Forgot / reset password: a WhatsApp code proves it's really you, then choose a new password. */
export default function ForgotPasswordScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

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

  const header = (
    <View>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backChip} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={15} color="#fff" />
          <Text style={styles.backChipText}>Back to Login</Text>
        </TouchableOpacity>
        <View style={styles.pill}>
          <MaterialCommunityIcons name="whatsapp" size={12} color="#5EEAD4" />
          <Text style={styles.pillText}>RESET WITH WHATSAPP</Text>
        </View>
      </View>

      <View style={styles.portalChip}>
        <View style={styles.portalDot} />
        <Text style={styles.portalChipText}>UK TEXTILES PORTAL · {APP_VERSION_LABEL}</Text>
      </View>

      <Text style={styles.headline}>Forgot your password?</Text>
      <Text style={styles.headSub}>
        Enter your employee code and we will WhatsApp you a code. Enter it here to choose a new password.
      </Text>
    </View>
  );

  return (
    <>
      <AuthShell header={header}>
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
                <AuthInput
                  label="New password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  isPassword
                  returnKeyType="next"
                  leftIconName="lock-outline"
                  containerStyle={{ marginBottom: 10 }}
                />
                <AuthInput
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

        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.link}>
          <Text style={styles.linkText}>
            Remembered it? <Text style={styles.linkAccent}>Sign In →</Text>
          </Text>
        </TouchableOpacity>
      </AuthShell>

      <Toast message={toast.message} type="success" visible={toast.visible} />
    </>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    // ── header (on the emerald backdrop) ──
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
    backChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    backChipText: { color: '#fff', fontFamily: AuthFont.bodyBold, fontSize: 12.5 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    pillText: { color: '#fff', fontFamily: AuthFont.bodyBold, fontSize: 10, letterSpacing: 0.8 },
    portalChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 11,
      paddingVertical: 5,
      marginBottom: 14,
    },
    portalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5EEAD4' },
    portalChipText: { color: '#fff', fontFamily: AuthFont.bodyBold, fontSize: 10.5, letterSpacing: 1 },
    headline: { color: '#fff', fontFamily: AuthFont.display, fontSize: 27, lineHeight: 35, letterSpacing: -0.3 },
    headSub: { color: 'rgba(255,255,255,0.86)', fontFamily: AuthFont.body, fontSize: 13.5, lineHeight: 20, marginTop: 10 },

    // ── sheet ──
    noticeBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: Colors.badgeRedBg,
      borderRadius: BorderRadius.md,
      padding: 12,
      marginBottom: 6,
    },
    noticeText: { flex: 1, color: Colors.badgeRedText, fontFamily: AuthFont.body, fontSize: 13, lineHeight: 18 },

    hrCard: { marginTop: 8 },
    link: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
    linkRow: { alignItems: 'center', paddingVertical: 10 },
    linkText: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 13 },
    linkAccent: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 13.5 },
  });
