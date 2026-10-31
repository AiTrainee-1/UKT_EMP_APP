import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/TextArea';
import { DatePickerField } from '../ui/DatePickerField';
import { WorkflowOffNote } from '../approval/WorkflowOffNote';
import { useApplyCasualLeave, type CLEligibilityMonth } from '../../hooks/useCasualLeave';
import { checkRequestDate } from '../../lib/requestWindow';
import { casualLeaveDefaultDate, casualLeaveMonthBlock, requestPickerLimits } from '../../lib/requestWindowForm';
import { workflowOff, type ApprovalSummaryItem } from '../../lib/approval';
import {
  CL_PORTIONS,
  PORTION_LABEL,
  firstAllowed,
  monthOfDate,
  portionChoices,
  portionMeaning,
  type CLPortion,
  type ShiftHalves,
} from '../../lib/casualLeave';

const PORTION_ICON: Record<CLPortion, string> = {
  full: 'weather-sunny',
  first_half: 'weather-sunset-up',
  second_half: 'weather-sunset-down',
};

/**
 * Apply for Casual Leave: a date, Full day / First half / Second half (each explained in the employee's shift time when the
 * shift is known), and a reason. A part the month no longer allows is shown greyed with the reason. The server decides;
 * its refusal is shown inside the sheet (the toast would be hidden behind it).
 */
export function ClApplySheet({
  visible,
  onClose,
  employeeId,
  months,
  shift,
  workflow,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  employeeId: number | null;
  months: CLEligibilityMonth[] | undefined;
  shift: ShiftHalves | null | undefined;
  workflow: ApprovalSummaryItem | null | undefined;
  onSubmitted: (message: string) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const apply = useApplyCasualLeave(employeeId);
  const limits = requestPickerLimits(new Date());

  const [date, setDate] = useState(() => casualLeaveDefaultDate(new Date(), months));
  const [portion, setPortion] = useState<CLPortion | null>('full');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ date?: string; reason?: string; portion?: string; server?: string }>({});

  const month = monthOfDate(months, date);
  const choices = useMemo(() => portionChoices(month, date), [month, date]);
  const monthBlock = casualLeaveMonthBlock(date, months);
  const off = workflowOff(workflow);

  // Every opening starts fresh: today (or the open month), the first part still allowed, no reason, no messages.
  useEffect(() => {
    if (!visible) return;
    const start = casualLeaveDefaultDate(new Date(), months);
    setDate(start);
    setPortion(firstAllowed(portionChoices(monthOfDate(months, start), start)));
    setReason('');
    setErrors({});
    // months is read at opening on purpose: a refetch while the sheet is open must not wipe what the employee typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A new date can rule out the chosen part (that half of that date is taken): move to one that is still allowed.
  useEffect(() => {
    if (portion && !choices[portion].enabled) setPortion(firstAllowed(choices));
  }, [choices, portion]);

  const submit = async () => {
    const dateMessage = checkRequestDate(date, new Date());
    const reasonMessage = reason.trim().length < 5 ? 'Please give a reason (at least 5 letters).' : undefined;
    const portionMessage = !portion ? 'Choose Full day, First half or Second half.' : undefined;
    if (dateMessage || reasonMessage || portionMessage || monthBlock) {
      setErrors({ date: dateMessage ?? undefined, reason: reasonMessage, portion: portionMessage });
      return;
    }
    setErrors({});
    try {
      await apply.mutateAsync({ date, reason: reason.trim(), portion: portion! });
      onSubmitted(
        portion === 'full'
          ? 'Your Casual Leave request has been sent for approval.'
          : `Your half-day Casual Leave (${PORTION_LABEL[portion!].toLowerCase()}) has been sent for approval.`,
      );
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = data?.error || data?.message || 'Could not send it. Please try again.';
      setErrors({ date: data?.code === 'request_window_closed' ? msg : undefined, server: msg });
    }
  };

  const formError = errors.server ?? errors.portion ?? errors.date ?? errors.reason;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Apply for Casual Leave">
      <DatePickerField
        label="Date"
        value={date}
        onChange={(v) => {
          setDate(v);
          setErrors((e) => ({ ...e, date: undefined, server: undefined }));
        }}
        error={errors.date ?? monthBlock ?? undefined}
        minDate={limits.minDate}
        maxDate={limits.maxDate}
        hint={limits.hint}
      />

      <Text style={styles.label}>Which part of the day?</Text>
      <View style={styles.options} accessibilityRole="radiogroup">
        {CL_PORTIONS.map((p) => {
          const choice = choices[p];
          const active = portion === p;
          return (
            <TouchableOpacity
              key={p}
              disabled={!choice.enabled}
              onPress={() => {
                setPortion(p);
                setErrors((e) => ({ ...e, portion: undefined, server: undefined }));
              }}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !choice.enabled }}
              accessibilityLabel={`${PORTION_LABEL[p]}. ${choice.enabled ? portionMeaning(p, shift) : choice.why ?? ''}`}
              testID={`cl-portion-${p}`}
            >
              <MotiView
                animate={{ scale: active ? 1 : 0.98, opacity: choice.enabled ? 1 : 0.5 }}
                transition={{ type: 'timing', duration: 180 }}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={[styles.optionIcon, active && { backgroundColor: Colors.primary }]}>
                  <MaterialCommunityIcons name={PORTION_ICON[p] as any} size={18} color={active ? '#fff' : Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, active && { color: Colors.primary }]}>
                    {PORTION_LABEL[p]}
                    <Text style={styles.optionDays}>{p === 'full' ? '  ·  1 day' : '  ·  ½ day'}</Text>
                  </Text>
                  <Text style={styles.optionText}>{choice.enabled ? portionMeaning(p, shift) : choice.why}</Text>
                </View>
                <MaterialCommunityIcons
                  name={active ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={active ? Colors.primary : Colors.outline}
                />
              </MotiView>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.rule}>
        Each month you get one Casual Leave: one full day, or two half-days on any dates of that month.
      </Text>

      <TextArea
        label="Reason"
        placeholder="Why do you need Casual Leave?"
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          setErrors((e) => ({ ...e, reason: undefined, server: undefined }));
        }}
        minLength={5}
        maxLength={200}
        error={errors.reason}
      />
      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <WorkflowOffNote workflow={workflow} style={{ marginBottom: 12 }} />
      <Button
        title="Send for approval"
        onPress={submit}
        loading={apply.isPending}
        disabled={off || !!monthBlock || !portion}
      />
    </BottomSheet>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
    options: { gap: 8, marginBottom: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: Colors.outlineVariant,
      backgroundColor: Colors.bgSurfaceLow,
    },
    optionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
    optionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.bgCard,
    },
    optionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    optionDays: { color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12 },
    optionText: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2, lineHeight: 16 },
    rule: { color: Colors.textMuted, fontSize: 11.5, marginBottom: 14, lineHeight: 16 },
    error: { color: Colors.error, fontSize: 12, marginBottom: 8, marginTop: -4 },
  });
