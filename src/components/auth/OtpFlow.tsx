import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthInput } from './AuthInput';
import { AuthButton } from './AuthButton';
import { AuthColors, AuthFont } from './authTheme';
import { SupportContactCard } from '../support/SupportContactCard';
import { SupportInlineLink } from '../support/SupportInlineLink';
import { isServerProblem } from '../../lib/supportContact';
import {
  CODE_EXPIRED_NOTICE,
  askAgainLabel,
  codeLabel,
  describeOtpRequestError,
  enterCodeMessage,
  haveCodeNotice,
  isCompleteOtp,
  otpCopy,
  otpDigits,
  otpHelpLine,
  otpLength,
  positiveSeconds,
  resendLabel,
  resolveOtpChannel,
  sentNotice,
  sentNoticeText,
} from '../../lib/otp';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { useCountdown } from '../../hooks/useCountdown';
import { authErrorMessage, requestOtp, type OtpPurpose, type OtpRequestResult } from '../../hooks/useAuth';

interface Props {
  purpose: OtpPurpose;
  submitLabel: string;
  /**
   * How the server says codes are delivered ('sms' | 'whatsapp'), from GET /auth/login-options. Used for the wording
   * until the request itself names the channel; missing or unknown on an older server, which gives a neutral "a code".
   */
  channel?: string | null;
  /**
   * How many digits the code has (4 by SMS, 6 on WhatsApp), from GET /auth/login-options `codeLength`. Missing on an
   * older server: the channel decides (see otpLength in src/lib/otp.ts). The request's own `codeLength` wins once sent.
   */
  codeLength?: number | null;
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
  /**
   * When a code could not be asked for, offers "Use my password instead" with this action. Only the sign-in screen
   * passes it (a reset or an activation has no password to fall back on).
   */
  onUsePassword?: () => void;
}

/**
 * The two steps every one-time-code flow shares: ask for a code by Employee Code, then enter it. The code arrives by SMS
 * or WhatsApp - HR's choice, reported by the server - and the wording follows (see src/lib/otp.ts). The server decides
 * where the code goes (the number HR has on file), so the app never sees or types a phone number.
 *
 * The code is only ever held in this component's state: it is never logged, stored or sent anywhere but the sign-in
 * request itself.
 */
export function OtpFlow({
  purpose,
  submitLabel,
  channel: channelFromOptions,
  codeLength: codeLengthFromOptions,
  extraValid = true,
  extraFields,
  initialIdentifier,
  onSubmit,
  onStepChange,
  onUsePassword,
}: Props) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  // The employee still has a code from a moment ago (asking again was too soon): step 2 without a fresh "sent" notice.
  const [haveCode, setHaveCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The error is the server not answering (or a 5xx): offer the software-support contact with it.
  const [serverProblem, setServerProblem] = useState(false);
  // A code could not be asked for: offer the HR contact (and the password, where the screen has that way in).
  const [offerHr, setOfferHr] = useState(false);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown();
  const expiry = useCountdown();

  // What the request said wins over what the sign-in options said.
  const channel = resolveOtpChannel(sent?.channel, channelFromOptions);
  // The same for the code's length: what the request said, else the sign-in options, else what the channel implies.
  const length = otpLength(sent?.codeLength ?? codeLengthFromOptions, channel);
  const copy = otpCopy(channel, length);
  const expiryKnown = !!sent && positiveSeconds(sent.expiresInSeconds) > 0;
  const codeExpired = expiryKnown && expiry.seconds === 0;

  // The remembered code arrives after mount; never overwrite something the employee already typed.
  useEffect(() => {
    if (initialIdentifier) setIdentifier((cur) => cur || initialIdentifier);
  }, [initialIdentifier]);

  const clearProblem = () => {
    setError(null);
    setServerProblem(false);
    setOfferHr(false);
  };

  const ask = async () => {
    clearProblem();
    if (!identifier.trim()) return setError('Enter your employee code.');
    setBusy(true);
    try {
      const result = await requestOtp(identifier.trim(), purpose);
      setSent(result);
      setHaveCode(false);
      setOtp('');
      resend.start(positiveSeconds(result.resendAfterSeconds));
      expiry.start(positiveSeconds(result.expiresInSeconds));
      onStepChange?.(2);
    } catch (err: any) {
      // The server's own sentence says what happened (too soon, SMS unavailable, could not send, turned off ...);
      // asking again too soon also says how long to wait.
      const problem = describeOtpRequestError(err, 'Could not send the code. Please try again.');
      if (problem.waitSeconds) resend.start(problem.waitSeconds);
      setError(problem.message);
      setServerProblem(problem.serverDown);
      setOfferHr(problem.offerHr);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    clearProblem();
    if (!isCompleteOtp(otp, length)) return setError(enterCodeMessage(length));
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

  const onIdentifierChange = (text: string) => {
    setIdentifier(text);
    // The wait (and the message about it) belongs to the employee it was given for.
    if (resend.seconds > 0) resend.start(0);
    if (error) clearProblem();
  };

  const useExistingCode = () => {
    clearProblem();
    setSent({ maskedPhone: '', expiresInSeconds: 0, resendAfterSeconds: 0 });
    setHaveCode(true);
    setOtp('');
    expiry.start(0);
    onStepChange?.(2);
  };

  const changeEmployee = () => {
    setSent(null);
    setHaveCode(false);
    setOtp('');
    clearProblem();
    expiry.start(0);
    onStepChange?.(1);
  };

  const errorNote = error ? (
    <View>
      <View style={styles.errorBox} accessibilityRole="alert">
        <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.statusRed} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
      {serverProblem && <SupportContactCard situation="server" compact style={styles.serverCard} />}
      {offerHr && (
        <View>
          {onUsePassword && (
            <TouchableOpacity
              onPress={onUsePassword}
              style={styles.passwordButton}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="lock-outline" size={16} color={AuthColors.accentDark} />
              <Text style={styles.passwordButtonText}>Use my password instead</Text>
            </TouchableOpacity>
          )}
          <SupportContactCard
            situation="hr"
            compact
            description={otpHelpLine(purpose, !!onUsePassword)}
            style={styles.serverCard}
          />
        </View>
      )}
    </View>
  ) : null;

  if (!sent) {
    const waiting = resend.seconds > 0;
    return (
      <View>
        <AuthInput
          label="Employee Code"
          placeholder="e.g. UKT-10482"
          keyboardType="numeric"
          value={identifier}
          onChangeText={onIdentifierChange}
          returnKeyType="send"
          onSubmitEditing={waiting ? undefined : ask}
          leftIconName="badge-account-outline"
          containerStyle={{ marginBottom: 10 }}
        />
        <Text style={styles.hint}>{copy.askHint}</Text>
        {errorNote}
        <AuthButton
          title={askAgainLabel(copy.askButton, resend.seconds)}
          onPress={ask}
          loading={busy}
          disabled={waiting}
          icon={<MaterialCommunityIcons name={copy.icon} size={18} color={AuthColors.pillCircle} />}
        />
        {waiting && !!identifier.trim() && (
          <TouchableOpacity onPress={useExistingCode} hitSlop={8} style={styles.haveCodeRow} accessibilityRole="button">
            <Text style={[styles.footerLink, styles.footerAccent]}>I already have a code</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const notice = sentNotice(channel, sent.maskedPhone, sent.expiresInSeconds);

  return (
    <View>
      <View style={styles.sentBox} accessibilityRole="alert">
        <MaterialCommunityIcons name={copy.icon} size={18} color={Colors.statusGreen} />
        {haveCode ? (
          <Text style={styles.sentText}>{haveCodeNotice(channel, length)}</Text>
        ) : (
          <Text style={styles.sentText} accessibilityLabel={sentNoticeText(notice)}>
            {notice.lead}
            {!!notice.masked && <Text style={styles.sentStrong}>{notice.masked}</Text>}
            {notice.tail}
          </Text>
        )}
      </View>

      {codeExpired && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <MaterialCommunityIcons name="clock-alert-outline" size={16} color={Colors.statusRed} />
          <Text style={styles.errorText}>{CODE_EXPIRED_NOTICE}</Text>
        </View>
      )}

      <AuthInput
        label={codeLabel(length)}
        placeholder="Enter the code"
        keyboardType="number-pad"
        maxLength={length}
        value={otp}
        onChangeText={(t) => setOtp(otpDigits(t, length))}
        // Lets the keyboard offer the code from the SMS (iOS / Android) or the browser fill it (web preview).
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'}
        importantForAutofill="yes"
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        returnKeyType="done"
        onSubmitEditing={extraFields ? undefined : submit}
        leftIconName="shield-key-outline"
        autoFocus
      />
      {extraFields}
      {errorNote}
      <AuthButton
        title={submitLabel}
        onPress={submit}
        loading={busy}
        disabled={!extraValid || otp.length !== length}
        icon={<MaterialCommunityIcons name="arrow-right" size={17} color="#fff" />}
      />

      <View style={styles.footerRow}>
        <TouchableOpacity onPress={changeEmployee} hitSlop={8}>
          <Text style={styles.footerLink}>Change employee code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={resend.seconds > 0 || busy}
          onPress={ask}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: resend.seconds > 0 || busy }}
        >
          <Text style={[styles.footerLink, styles.footerAccent, resend.seconds > 0 && styles.footerDisabled]}>
            {resendLabel(resend.seconds)}
          </Text>
        </TouchableOpacity>
      </View>

      <SupportInlineLink
        situation="hr"
        prefix="Not getting the code? "
        style={styles.helpRow}
        textStyle={styles.helpText}
        accentStyle={styles.helpAccent}
      />
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    hint: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 12, lineHeight: 17, marginBottom: 16, marginLeft: 2 },
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
    errorText: { flex: 1, color: Colors.badgeRedText, fontFamily: AuthFont.bodySemi, fontSize: 13, lineHeight: 18 },
    serverCard: { marginBottom: 12 },
    passwordButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: AuthColors.accentSoft,
      borderRadius: BorderRadius.full,
      paddingVertical: 11,
      marginBottom: 12,
    },
    passwordButtonText: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 13.5 },
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
    sentText: { flex: 1, color: Colors.badgeGreenText, fontFamily: AuthFont.body, fontSize: 13, lineHeight: 18 },
    sentStrong: { fontFamily: AuthFont.bodyBold },
    haveCodeRow: { alignItems: 'center', paddingTop: 14 },
    footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16 },
    footerLink: { color: Colors.textMuted, fontFamily: AuthFont.bodyBold, fontSize: 13 },
    footerAccent: { color: AuthColors.accentDark },
    footerDisabled: { color: Colors.textMuted },
    helpRow: { alignItems: 'center', paddingTop: 16 },
    helpText: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 12.5 },
    helpAccent: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold },
  });
