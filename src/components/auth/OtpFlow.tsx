import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
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
  channelChoices,
  channelUnavailable,
  chooseButtonLabel,
  chooseHint,
  codeLabel,
  codeLengthFor,
  describeOtpRequestError,
  enterCodeMessage,
  fallbackChannels,
  fallbackOffer,
  haveCodeNotice,
  isCompleteOtp,
  normalizeOtpChannel,
  otpCopy,
  otpDigits,
  otpHelpLine,
  otpLength,
  positiveSeconds,
  requestChannel,
  resendLabel,
  resolveOtpChannel,
  sentNotice,
  sentNoticeText,
  singleChannel,
  type OtpChannel,
  type PurposeCodes,
} from '../../lib/otp';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { useCountdown } from '../../hooks/useCountdown';
import { useRememberedOtpChannel } from '../../hooks/useLoginOptions';
import { authErrorMessage, requestOtp, type OtpPurpose, type OtpRequestResult } from '../../hooks/useAuth';

interface Props {
  purpose: OtpPurpose;
  submitLabel: string;
  /**
   * What the server offers for this purpose (purposeCodes() / unknownCodes() in src/lib/otp.ts, from GET
   * /auth/login-options): the channels a code can go by (WhatsApp and SMS are switched on separately; with both on the
   * employee picks), each one's code length, and whether the server takes a `channel` at all (an older one does not:
   * then nothing is named until the request's answer does, and a server from before the SMS channel gives "a code").
   */
  codes: PurposeCodes;
  /** The server refused the channel asked for (HR switched it off meanwhile): reload the sign-in options. */
  onChannelsChanged?: () => void;
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
 * The two steps every one-time-code flow shares: ask for a code by Employee Code, then enter it. The code arrives by
 * WhatsApp or SMS - whichever HR has switched on; with both on, the employee picks ("Send code by WhatsApp" / "Send code
 * by SMS", the last pick first) and, once a code went out, may ask for it the other way instead. The wording follows
 * the channel (see src/lib/otp.ts). The server decides where the code goes (the number HR has on file), so the app never
 * sees or types a phone number.
 *
 * The code is only ever held in this component's state: it is never logged, stored or sent anywhere but the sign-in
 * request itself. (The channel picked is remembered on the phone - a preference, not the code.)
 */
export function OtpFlow({
  purpose,
  submitLabel,
  codes,
  onChannelsChanged,
  extraValid = true,
  extraFields,
  initialIdentifier,
  onSubmit,
  onStepChange,
  onUsePassword,
}: Props) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const remembered = useRememberedOtpChannel();

  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  // The channel the code on screen was asked for (the answer's own `channel` wins when it names one).
  const [sentVia, setSentVia] = useState<OtpChannel | null>(null);
  // The employee still has a code from a moment ago (asking again was too soon): step 2 without a fresh "sent" notice.
  const [haveCode, setHaveCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The error is the server not answering (or a 5xx): offer the software-support contact with it.
  const [serverProblem, setServerProblem] = useState(false);
  // A code could not be asked for: offer the HR contact (and the password, where the screen has that way in).
  const [offerHr, setOfferHr] = useState(false);
  const [busy, setBusy] = useState<false | 'ask' | 'submit'>(false);
  // Which channel's request is running (its button shows the spinner).
  const [askingVia, setAskingVia] = useState<OtpChannel | null>(null);
  // The channel the resend wait belongs to (null = not known: it holds every button).
  const [waitFor, setWaitFor] = useState<OtpChannel | null>(null);
  const resend = useCountdown();
  const expiry = useCountdown();

  // Step 1: the ways on offer, the remembered one first. One way: it is used as before; none named: "a code".
  const choices = channelChoices(codes.channels, remembered.channel);
  const only = singleChannel(codes);
  const askCopy = otpCopy(only, codeLengthFor(codes, only));

  // Step 2: what the request said wins over what was asked for / what the sign-in options said.
  const channel = resolveOtpChannel(sent?.channel, sentVia ?? only);
  // The same for the code's length: what the request said, else the sign-in options, else what the channel implies.
  const length = otpLength(sent?.codeLength ?? codeLengthFor(codes, channel), channel);
  const copy = otpCopy(channel, length);
  const expiryKnown = !!sent && positiveSeconds(sent.expiresInSeconds) > 0;
  const codeExpired = expiryKnown && expiry.seconds === 0;
  // "Didn't get it? Send by SMS instead": the other ways the answer offered that are still on offer.
  const fallback = sent && !haveCode ? fallbackChannels(sent.otherChannels, channel, codes.choosable ? codes.channels : undefined) : [];

  // The remembered code arrives after mount; never overwrite something the employee already typed.
  useEffect(() => {
    if (initialIdentifier) setIdentifier((cur) => cur || initialIdentifier);
  }, [initialIdentifier]);

  const clearProblem = () => {
    setError(null);
    setServerProblem(false);
    setOfferHr(false);
  };

  /** Whether the server's resend wait holds this channel's button. */
  const waitingFor = (via: OtpChannel | null) =>
    resend.seconds > 0 && (waitFor === null || via === null || waitFor === via);

  /** Asks for a code by `via` (null = the server's choice). `switching` = the step-2 "send it the other way instead". */
  const ask = async (via: OtpChannel | null, switching = false) => {
    clearProblem();
    if (!identifier.trim()) return setError('Enter your employee code.');
    setBusy('ask');
    setAskingVia(via);
    try {
      const result = await requestOtp(identifier.trim(), purpose, requestChannel(codes, via));
      const used = normalizeOtpChannel(result.channel) ?? via;
      setSent(result);
      setSentVia(used);
      setHaveCode(false);
      setOtp('');
      setWaitFor(used);
      resend.start(positiveSeconds(result.resendAfterSeconds));
      expiry.start(positiveSeconds(result.expiresInSeconds));
      // Remembered only when the employee had a choice.
      if (used && codes.choosable && (codes.channels.length > 1 || switching)) remembered.remember(used);
      onStepChange?.(2);
    } catch (err: any) {
      const gone = channelUnavailable(err);
      if (gone) {
        // HR switched that way off meanwhile: say so, and let the screen reload what is on offer now.
        setError(gone.message);
        setOfferHr(gone.available.length === 0);
        onChannelsChanged?.();
        return;
      }
      // The server's own sentence says what happened (too soon, SMS unavailable, could not send, turned off ...);
      // asking again too soon also says how long to wait (for that channel: the other one has its own wait).
      const problem = describeOtpRequestError(err, 'Could not send the code. Please try again.');
      if (problem.waitSeconds && !switching) {
        setWaitFor(via);
        resend.start(problem.waitSeconds);
      }
      setError(problem.message);
      setServerProblem(problem.serverDown);
      setOfferHr(problem.offerHr);
    } finally {
      setBusy(false);
      setAskingVia(null);
    }
  };

  const submit = async () => {
    clearProblem();
    if (!isCompleteOtp(otp, length)) return setError(enterCodeMessage(length));
    setBusy('submit');
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
    setSent({ maskedPhone: '', expiresInSeconds: 0, resendAfterSeconds: 0, channel: waitFor ?? undefined });
    setSentVia(waitFor);
    setHaveCode(true);
    setOtp('');
    expiry.start(0);
    onStepChange?.(2);
  };

  const changeEmployee = () => {
    setSent(null);
    setSentVia(null);
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
    const anyWaiting = resend.seconds > 0;
    const picking = choices.length > 1;
    const main = choices[0] ?? null;
    const mainWaiting = waitingFor(main);
    return (
      <View>
        <AuthInput
          label="Employee Code"
          placeholder="e.g. UKT-10482"
          keyboardType="numeric"
          value={identifier}
          onChangeText={onIdentifierChange}
          returnKeyType="send"
          onSubmitEditing={mainWaiting || busy ? undefined : () => void ask(main)}
          leftIconName="badge-account-outline"
          containerStyle={{ marginBottom: 10 }}
        />
        <Text style={styles.hint}>{picking ? chooseHint(codes) : askCopy.askHint}</Text>
        {errorNote}
        <AuthButton
          title={askAgainLabel(picking && main ? chooseButtonLabel(main) : askCopy.askButton, mainWaiting ? resend.seconds : 0)}
          onPress={() => void ask(main)}
          loading={busy === 'ask' && askingVia === main}
          disabled={mainWaiting || busy !== false}
          icon={<MaterialCommunityIcons name={otpCopy(main).icon} size={18} color={AuthColors.pillCircle} />}
        />
        {picking &&
          choices.slice(1).map((via) => {
            const waiting = waitingFor(via);
            const loading = busy === 'ask' && askingVia === via;
            const disabled = waiting || busy !== false;
            return (
              <TouchableOpacity
                key={via}
                onPress={() => void ask(via)}
                disabled={disabled}
                style={[styles.altButton, disabled && !loading && styles.altButtonDisabled]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ disabled, busy: loading }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={AuthColors.accentDark} />
                ) : (
                  <MaterialCommunityIcons name={otpCopy(via).icon} size={17} color={AuthColors.accentDark} />
                )}
                <Text style={styles.altButtonText}>{askAgainLabel(chooseButtonLabel(via), waiting ? resend.seconds : 0)}</Text>
              </TouchableOpacity>
            );
          })}
        {anyWaiting && !!identifier.trim() && (
          <TouchableOpacity onPress={useExistingCode} hitSlop={8} style={styles.haveCodeRow} accessibilityRole="button">
            <Text style={[styles.footerLink, styles.footerAccent]}>I already have a code</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const notice = sentNotice(channel, sent.maskedPhone, sent.expiresInSeconds);
  const other = fallback[0] ?? null;
  const offer = other ? fallbackOffer(other) : null;
  const switchingNow = busy === 'ask' && other !== null && askingVia === other;

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
        loading={busy === 'submit'}
        disabled={!extraValid || otp.length !== length || busy === 'ask'}
        icon={<MaterialCommunityIcons name="arrow-right" size={17} color="#fff" />}
      />

      <View style={styles.footerRow}>
        <TouchableOpacity onPress={changeEmployee} hitSlop={8}>
          <Text style={styles.footerLink}>Change employee code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={resend.seconds > 0 || busy !== false}
          onPress={() => void ask(channel)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: resend.seconds > 0 || busy !== false }}
        >
          <Text style={[styles.footerLink, styles.footerAccent, resend.seconds > 0 && styles.footerDisabled]}>
            {resendLabel(resend.seconds)}
          </Text>
        </TouchableOpacity>
      </View>

      {offer && other && (
        <TouchableOpacity
          onPress={() => void ask(other, true)}
          disabled={busy !== false}
          hitSlop={8}
          style={styles.fallbackRow}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== false, busy: switchingNow }}
        >
          <MaterialCommunityIcons name={otpCopy(other).icon} size={15} color={AuthColors.accentDark} />
          <Text style={styles.helpText}>
            {offer.prefix}
            <Text style={styles.helpAccent}>{switchingNow ? 'Sending…' : offer.action}</Text>
          </Text>
        </TouchableOpacity>
      )}

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
    // The second way to get the code while the employee picks (the main one is the dark pill above it).
    altButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: AuthColors.accentSoft,
      borderRadius: BorderRadius.full,
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 10,
    },
    altButtonDisabled: { opacity: 0.6 },
    altButtonText: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold, fontSize: 14 },
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
    fallbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 16 },
    helpRow: { alignItems: 'center', paddingTop: 16 },
    helpText: { color: Colors.textMuted, fontFamily: AuthFont.body, fontSize: 12.5 },
    helpAccent: { color: AuthColors.accentDark, fontFamily: AuthFont.bodyBold },
  });
