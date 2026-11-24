import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { TextArea } from '../ui/TextArea';
import { ShiftPicker } from './ShiftPicker';
import { isQueued, QUEUED_MESSAGE } from '../../offline/submit';
import { useSubmitCompensationClaim } from '../../hooks/useCompensation';
import { kindTone, shiftsLabel } from '../../lib/compensation';
import { REASON_MAX, REASON_MIN, buildClaimBody, claimErrorMessage, type ClaimDraft } from '../../lib/compensationClaims';

/**
 * Claim one item (a Sunday / holiday worked, an OT allowance, an OT credit, a birthday worked): what is claimed, how much
 * where the employee chooses (quarters; an OT credit never above what the OT earns), and a reason. Sent to the employee's
 * Department Head. The server's refusal is shown inside the sheet as it words it (a toast would be hidden behind it).
 */
export function ClaimSheet({
  draft,
  onClose,
  onSubmitted,
}: {
  /** The claim to make; null = closed. */
  draft: ClaimDraft | null;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const submit = useSubmitCompensationClaim();

  const [shifts, setShifts] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ shifts?: string; reason?: string; server?: string }>({});

  // Every opening starts fresh: the suggested amount, no reason, no messages.
  useEffect(() => {
    if (!draft) return;
    setShifts(draft.defaultShifts);
    setReason('');
    setErrors({});
    submit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (!draft) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const tone = kindTone(draft.kind === 'birthday' ? 'birthday_credit' : draft.kind);
  const amount = draft.fixedShifts != null ? shiftsLabel(draft.fixedShifts) : null;

  const send = async () => {
    const built = buildClaimBody(draft, shifts, reason);
    if (!built.ok) {
      setErrors({ [built.field]: built.error });
      return;
    }
    setErrors({});
    try {
      const sent = await submit.mutateAsync(built.body);
      onSubmitted(isQueued(sent) ? QUEUED_MESSAGE : 'Claim sent to your Department Head.');
    } catch (err) {
      setErrors({ server: claimErrorMessage(err, 'Could not send the claim. Please try again.') });
    }
  };

  return (
    <BottomSheet visible onClose={onClose} title={draft.title}>
      <View
        style={[styles.summary, { backgroundColor: isDark ? tone.softDark : tone.softLight, borderColor: tone.solid }]}
        accessible
        accessibilityLabel={`${draft.summary}${amount ? ` Credit: ${amount}.` : ''}`}
      >
        <View style={[styles.summaryIcon, { backgroundColor: tone.solid }]}>
          <MaterialCommunityIcons name={tone.icon as any} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.summaryKind, { color: isDark ? tone.inkDark : tone.inkLight }]}>{tone.label}</Text>
          <Text style={styles.summaryText}>{draft.summary}</Text>
          {!!amount && <Text style={styles.summaryAmount}>Credit: {amount}</Text>}
        </View>
      </View>

      {draft.shiftOptions && (
        <ShiftPicker
          label={draft.kind === 'ot_shift' ? 'How much to claim' : 'Shifts to claim'}
          choices={draft.shiftOptions}
          value={shifts}
          onChange={(v) => {
            setShifts(v);
            setErrors((e) => ({ ...e, shifts: undefined, server: undefined }));
          }}
          error={errors.shifts}
          testID="claim-shifts"
        />
      )}

      <Text style={styles.note}>{draft.note}</Text>

      <TextArea
        label="Reason"
        placeholder="What did you work on?"
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
      <Button title="Send to my Department Head" onPress={send} loading={submit.isPending} />
    </BottomSheet>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    summary: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      padding: 12,
      marginBottom: 14,
    },
    summaryIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    summaryKind: { fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    summaryText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 2 },
    summaryAmount: { color: Colors.textPrimary, fontSize: 12.5, fontWeight: '800', marginTop: 4 },
    note: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
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
