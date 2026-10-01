import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { SupportContactCard } from '../support/SupportContactCard';
import { isServerProblem } from '../../lib/supportContact';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useCountdown } from '../../hooks/useCountdown';
import { authErrorMessage, requestOtp, type OtpPurpose, type OtpRequestResult } from '../../hooks/useAuth';

interface Props {
  purpose: OtpPurpose;
  submitLabel: string;
  /** False while the extra fields (e.g. a new password) aren't valid yet. */
  extraValid?: boolean;
  /** Whatever else the last step needs — nothing for sign-in, a new-password pair for a reset. */
  extraFields?: React.ReactNode;
  /** Prefills the employee code (e.g. the one remembered from the last sign-in). */
  initialIdentifier?: string;
  /** Runs with the code the employee typed. Throw to show the message under the button. */
  onSubmit: (identifier: string, otp: string) => Promise<void>;
  /** 1 = asking for a code, 2 = entering it - so a screen can show its own progress. */
  onStepChange?: (step: 1 | 2) => void;
}

/**
 * The two steps every WhatsApp-code flow shares: ask for a code by Employee Code, then enter it.
 * The server decides where the code goes (the number HR has on file), so the app never sees or
 * types a phone number.
 */
export function OtpFlow({
  purpose,
  submitLabel,
  extraValid = true,
  extraFields,
  initialIdentifier,
  onSubmit,
  onStepChange,
}: Props) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The error is the server not answering (or a 5xx): offer the software-support contact with it.
  const [serverProblem, setServerProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown();

  // The remembered code arrives after mount; never overwrite something the employee already typed.
  useEffect(() => {
    if (initialIdentifier) setIdentifier((cur) => cur || initialIdentifier);
  }, [initialIdentifier]);

  const ask = async () => {
    setError(null);
    setServerProblem(false);
    if (!identifier.trim()) return setError('Enter your employee code.');
    setBusy(true);
    try {
      const result = await requestOtp(identifier.trim(), purpose);
      setSent(result);
      setOtp('');
      resend.start(result.resendAfterSeconds);
      onStepChange?.(2);
    } catch (err: any) {
      // Asking again too soon comes back with how long to wait.
      const wait = err?.response?.data?.retryAfterSeconds;
      if (wait) resend.start(wait);
      setError(authErrorMessage(err, 'Could not send the code. Please try again.'));
      setServerProblem(isServerProblem(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setServerProblem(false);
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code.');
    setBusy(true);
    try {
      await onSubmit(identifier.trim(), otp);
    } catch (err: any) {
      setError(authErrorMessage(err, 'That did not work. Please try again.'));
      setServerProblem(isServerProblem(err));
    } finally {
      setBusy(false);
    }
  };

  const errorNote = error ? (
    <View>
      <View style={styles.errorBox} accessibilityRole="alert">
        <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.statusRed} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
      {serverProblem && <SupportContactCard situation="server" compact style={styles.serverCard} />}
    </View>
  ) : null;

  if (!sent) {
    return (
      <View>
        <Input
          label="Employee Code"
          placeholder="e.g. UKT-10482"
          keyboardType="numeric"
          value={identifier}
          onChangeText={setIdentifier}
          returnKeyType="send"
          onSubmitEditing={ask}
          leftIconName="badge-account-outline"
          containerStyle={{ marginBottom: 10 }}
        />
        <Text style={styles.hint}>We will send a 6-digit code on WhatsApp to the number registered with HR.</Text>
        {errorNote}
        <Button
          title="Send code on WhatsApp"
          onPress={ask}
          loading={busy}
          icon={<MaterialCommunityIcons name="whatsapp" size={17} color="#fff" />}
        />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.sentBox} accessibilityRole="alert">
        <MaterialCommunityIcons name="whatsapp" size={18} color={Colors.statusGreen} />
        <Text style={styles.sentText}>
          Code sent to WhatsApp number <Text style={styles.sentStrong}>{sent.maskedPhone}</Text>. It expires in{' '}
          {Math.max(1, Math.round(sent.expiresInSeconds / 60))} minutes.
        </Text>
      </View>

      <Input
        label="6-digit code"
        placeholder="Enter the code"
        keyboardType="number-pad"
        maxLength={6}
        value={otp}
        onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        returnKeyType="done"
        onSubmitEditing={extraFields ? undefined : submit}
        leftIconName="shield-key-outline"
        autoFocus
      />
      {extraFields}
      {errorNote}
      <Button
        title={submitLabel}
        onPress={submit}
        loading={busy}
        disabled={!extraValid || otp.length !== 6}
        icon={<MaterialCommunityIcons name="arrow-right" size={17} color="#fff" />}
      />

      <View style={styles.footerRow}>
        <TouchableOpacity
          onPress={() => {
            setSent(null);
            setOtp('');
            setError(null);
            onStepChange?.(1);
          }}
          hitSlop={8}
        >
          <Text style={styles.footerLink}>Change employee code</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={resend.seconds > 0 || busy} onPress={ask} hitSlop={8}>
          <Text style={[styles.footerLink, styles.footerAccent, resend.seconds > 0 && styles.footerDisabled]}>
            {resend.seconds > 0 ? `Resend code in ${resend.seconds}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    hint: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 14, marginLeft: 4 },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: Colors.badgeRedBg,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    errorText: { flex: 1, color: Colors.badgeRedText, fontSize: 13, lineHeight: 18 },
    serverCard: { marginBottom: 12 },
    sentBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: Colors.badgeGreenBg,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    sentText: { flex: 1, color: Colors.badgeGreenText, fontSize: 13, lineHeight: 18 },
    sentStrong: { fontFamily: FontFamily.bodySemibold },
    footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16 },
    footerLink: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    footerAccent: { color: Colors.primary },
    footerDisabled: { color: Colors.textMuted },
  });
