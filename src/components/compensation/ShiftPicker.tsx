import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ShiftChoice } from '../../lib/compensationClaims';

/**
 * The quarters a claim / use-balance request can be (0.25, 0.50, 0.75, 1.00 shift) as one row of radio chips. A quarter
 * above the limit is shown greyed (so the employee sees why it cannot be picked), never hidden.
 */
export function ShiftPicker({
  label,
  choices,
  value,
  onChange,
  hint,
  error,
  testID,
}: {
  label: string;
  choices: ShiftChoice[];
  value: number | null;
  onChange: (value: number) => void;
  hint?: string | null;
  error?: string | null;
  testID?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {choices.map((c) => {
          const active = value != null && Math.abs(c.value - value) < 1e-6;
          return (
            <TouchableOpacity
              key={c.label}
              style={[styles.chip, active && styles.chipActive, !c.enabled && styles.chipOff]}
              onPress={() => onChange(c.value)}
              disabled={!c.enabled}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !c.enabled }}
              accessibilityLabel={`${c.label} shift${c.enabled ? '' : ', not available'}`}
              testID={testID ? `${testID}-${c.label}` : undefined}
            >
              <Text style={[styles.value, TabularNums, active && styles.valueActive, !c.enabled && styles.valueOff]}>{c.label}</Text>
              <Text style={[styles.unit, active && styles.valueActive, !c.enabled && styles.valueOff]}>shift</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: { marginBottom: 14 },
    label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
    row: { flexDirection: 'row', gap: 8 },
    chip: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: Colors.outlineVariant,
      backgroundColor: Colors.bgSurfaceLow,
    },
    chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
    chipOff: { opacity: 0.4 },
    value: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
    unit: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700' },
    valueActive: { color: '#fff' },
    valueOff: { color: Colors.textMuted },
    hint: { color: Colors.textMuted, fontSize: 11.5, marginTop: 6, lineHeight: 16 },
    error: { color: Colors.error, fontSize: 12, marginTop: 6 },
  });
