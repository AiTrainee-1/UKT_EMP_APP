import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { canWithdraw, useConfirmWithdraw, type WithdrawModule } from '../../hooks/useWithdraw';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * "Withdraw" on one of my own Leave / Permission / Casual Leave requests (owner 2026-11-24), shown only while it still
 * waits for an answer. Asks first ("Withdraw this request?"); the server has the last word (backend
 * mobile_withdraw_views.py refuses one that was decided meanwhile, and that sentence is shown).
 */
export function WithdrawButton({
  module,
  id,
  status,
  label,
  onDone,
}: {
  module: WithdrawModule;
  id: number;
  status: unknown;
  /** "leave request for 28 Nov" - used in the question and the confirmation. */
  label?: string;
  onDone?: (message: string) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { ask, isPending } = useConfirmWithdraw(onDone);
  if (!canWithdraw(status) || !Number.isFinite(id) || id <= 0) return null;
  return (
    <TouchableOpacity
      onPress={() => ask(module, id, label)}
      disabled={isPending}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={`Withdraw this ${label ?? 'request'}`}
      testID={`withdraw-${module}-${id}`}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={Colors.badgeRedText} />
      ) : (
        <MaterialCommunityIcons name="undo-variant" size={15} color={Colors.badgeRedText} />
      )}
      <Text style={styles.text}>Withdraw</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    btn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.badgeRedText,
      backgroundColor: Colors.badgeRedBg,
    },
    text: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: Colors.badgeRedText },
  });
