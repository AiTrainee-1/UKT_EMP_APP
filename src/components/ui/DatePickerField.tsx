import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

interface DatePickerFieldProps {
  label: string;
  value: string; // yyyy-MM-dd
  onChange: (date: string) => void;
  error?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function DatePickerField({
  label,
  value,
  onChange,
  error,
  minDate,
  maxDate,
}: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const parsedDate = value ? new Date(value + 'T00:00:00') : new Date();

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShow(false);
    if (selected) onChange(format(selected, 'yyyy-MM-dd'));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, !!error && styles.fieldError]}
        onPress={() => setShow(true)}
        activeOpacity={0.75}
      >
        <MaterialCommunityIcons name="calendar-outline" size={18} color={Colors.textMuted} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? format(parsedDate, 'dd MMM yyyy') : 'Select date'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
      {show && (
        <DateTimePicker
          value={parsedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minimumDate={minDate}
          maximumDate={maxDate}
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
        activeOpacity={0.75}
      >
        <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.textMuted} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || 'Select time'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
      {show && (
        <DateTimePicker
          value={getTimeAsDate()}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  fieldError: { borderColor: Colors.statusRed },
  value: { color: Colors.textPrimary, fontSize: 15, flex: 1 },
  placeholder: { color: Colors.textMuted },
  error: { color: Colors.statusRed, fontSize: 12, marginTop: 4 },
});
