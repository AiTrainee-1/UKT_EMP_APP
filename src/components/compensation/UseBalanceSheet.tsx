import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/TextArea';
import { DatePickerField } from '../ui/DatePickerField';
import { ShiftPicker } from './ShiftPicker';
import { useUseCompensationBalance } from '../../hooks/useCompensation';
import { shiftsLabel, type UseBalanceInfo } from '../../lib/compensation';
import {
  REASON_MAX,
  REASON_MIN,
  availableToUse,
  buildUseBody,
  claimErrorMessage,
  largestChoice,
  useBalanceChoices,
} from '../../lib/compensationClaims';
import { requestPickerLimits } from '../../lib/requestWindowForm';

/**
 * "Use my balance": take part of the compensation balance as time off on a working day. The day can be picked in the
 * request window only (this month; last month too on the 1st-5th: the same rule as every request form and the server),
 * the amount in quarters up to what is available (the balance less what waiting requests already ask for), at most one
 * shift a day. It goes to the employee's Department Head; the server checks the day itself.
 */
export function UseBalanceSheet({
  visible,
  onClose,
  info,
  balance,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  info: UseBalanceInfo | null;
  balance: number;
  onSubmitted: (message: string) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const send = useUseCompensationBalance();
  const limits = requestPickerLimits(new Date());

  const available = availableToUse(info, balance);
  const choices = useMemo(() => useBalanceChoices(available), [available]);

  const [date, setDate] = useState(limits.defaultDate);
  const [shifts, setShifts] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ date?: string; shifts?: string; reason?: string; server?: string }>({});

  // Every opening starts fresh: today (held in the window), the most that can be used up to a full shift, no reason.
  useEffect(() => {
    if (!visible) return;
    setDate(requestPickerLimits(new Date()).defaultDate);
    setShifts(largestChoice(useBalanceChoices(availableToUse(info, balance))));
    setReason('');
    setErrors({});
    send.reset();
    // the balance is read at opening on purpose: a refetch while the sheet is open must not reset the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = async () => {
    const built = buildUseBody(date, shifts, reason, available, new Date());
    if (!built.ok) {
      setErrors({ [built.field]: built.error });
      return;
    }
    setErrors({});
    try {
      await send.mutateAsync(built.body);
      onSubmitted(`Request to use ${shiftsLabel(built.body.shifts)} sent to your Department Head.`);
    } catch (err) {
      setErrors({ server: claimErrorMessage(err, 'Could not send the request. Please try again.') });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Use my balance">
      <View style={styles.figures} accessible accessibilityLabel={`Available to use: ${shiftsLabel(available)}`}>
        <Figure label="Balance" value={shiftsLabel(info?.balanceShifts ?? balance) ?? '0.00 shift'} />
        <Figure label="Waiting" value={shiftsLabel(info?.pendingShifts ?? 0) ?? '0.00 shift'} />
        <Figure label="Available" value={shiftsLabel(available) ?? '0.00 shift'} strong />
      </View>
      <Text style={styles.explain}>
        Take time off from your balance on a working day: that day counts as worked up to the shifts you use. Your
        Department Head approves it first.
      </Text>

      <DatePickerField
        label="Day off"
        value={date}
        onChange={(v) => {
          setDate(v);
          setErrors((e) => ({ ...e, date: undefined, server: undefined }));
        }}
        error={errors.date}
        minDate={limits.minDate}
        maxDate={limits.maxDate}
        hint={`${limits.hint}. A working day only.`}
      />

      <ShiftPicker
        label="Shifts to use"
        choices={choices}
        value={shifts}
        onChange={(v) => {
          setShifts(v);
          setErrors((e) => ({ ...e, shifts: undefined, server: undefined }));
        }}
        hint={available < 1 ? `Up to ${shiftsLabel(available)} available.` : 'At most 1.00 shift for one day.'}
        error={errors.shifts}
        testID="use-shifts"
      />

      <TextArea
        label="Reason"
        placeholder="Why do you need this time off?"
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          setErrors((e) => ({ ...e, reason: undefined, server: undefined }));
        }}
        minLength={REASON_MIN}
        maxLength={REASON_MAX}
        error={errors.reason}
      />
      {errors.server ? (
        <View style={styles.serverError} accessibilityLiveRegion="polite">
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.error} />
          <Text style={styles.serverErrorText}>{errors.server}</Text>
        </View>
      ) : null}
      <Button
        title="Send to my Department Head"
        onPress={submit}
        loading={send.isPending}
        disabled={largestChoice(choices) == null}
      />
    </BottomSheet>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.figure, strong && styles.figureStrong]}>
      <Text style={[styles.figureValue, TabularNums, strong && styles.figureValueStrong]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.figureLabel, strong && styles.figureLabelStrong]}>{label}</Text>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    figures: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    figure: {
      flex: 1,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.bgSurfaceLow,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    figureStrong: { backgroundColor: Colors.primary },
    figureValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 14 },
    figureValueStrong: { color: '#fff' },
    figureLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
    figureLabelStrong: { color: 'rgba(255,255,255,0.85)' },
    explain: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
    serverError: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: Colors.badgeRedBg,
      borderRadius: BorderRadius.md,
      padding: 10,
      marginBottom: 12,
    },
    serverErrorText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
  });
