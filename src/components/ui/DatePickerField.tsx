import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, startOfDay, endOfDay } from 'date-fns';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';

interface DatePickerFieldProps {
  label: string;
  value: string; // yyyy-MM-dd
  onChange: (date: string) => void;
  error?: string;
  minDate?: Date;
  maxDate?: Date;
  /** Small helper text under the field (e.g. which dates can be requested). Shown under `error` too: a message about the
   *  month picked should still tell the employee which days are open. */
  hint?: string;
}

export function DatePickerField({ label, value, onChange, error, minDate, maxDate, hint }: DatePickerFieldProps) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [show, setShow] = useState(false);
  const parsedDate = value ? new Date(value + 'T00:00:00') : new Date();

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShow(false);
    // Cancelling the Android dialog calls back with type 'dismissed' and the ORIGINAL date: that is not a choice.
    if (event.type === 'set' && selected) onChange(format(selected, 'yyyy-MM-dd'));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, !!error && styles.fieldError]}
        onPress={() => setShow(true)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="calendar-outline" size={18} color={Colors.primary} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? format(parsedDate, 'dd MMM yyyy') : 'Select date'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.outline} />
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {show && (
        <DateTimePicker
          value={parsedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          // The limits are whole days: the first day from 00:00, the last day up to 23:59:59.999.
          minimumDate={minDate ? startOfDay(minDate) : undefined}
          maximumDate={maxDate ? endOfDay(maxDate) : undefined}
        />
      )}
    </View>
  );
}

interface TimePickerFieldProps {
  label: string;
  value: string; // HH:mm
  onChange: (time: string) => void;
  error?: string;
}

export function TimePickerField({ label, value, onChange, error }: TimePickerFieldProps) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [show, setShow] = useState(false);

  const getTimeAsDate = () => {
    const d = new Date();
    if (value) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d;
  };

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShow(false);
    if (selected) onChange(format(selected, 'HH:mm'));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, !!error && styles.fieldError]}
        onPress={() => setShow(true)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.primary} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? format(getTimeAsDate(), 'h:mm a') : 'Select time'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.outline} />
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
      {show && (
        <DateTimePicker
          value={getTimeAsDate()}
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  container: { marginBottom: 14 },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgInput,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldError: { borderColor: Colors.error },
  value: { color: Colors.textPrimary, fontSize: 15, flex: 1 },
  placeholder: { color: Colors.outline },
  error: { color: Colors.error, fontSize: 12, marginTop: 4, marginLeft: 4 },
  hint: { color: Colors.textMuted, fontSize: 11.5, marginTop: 4, marginLeft: 4 },
});
