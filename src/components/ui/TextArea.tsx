import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps, Platform } from 'react-native';
import { Colors } from '../../constants/colors';
import { BorderRadius } from '../../constants/theme';

interface TextAreaProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  minLength?: number;
  maxLength?: number;
  minHeight?: number;
  maxHeight?: number;
}

export function TextArea({
  label,
  error,
  minLength,
  maxLength,
  minHeight = 90,
  maxHeight = 200,
  value,
  onChangeText,
  onFocus,
  onBlur,
  placeholder,
  ...props
}: TextAreaProps) {
  const [focused, setFocused] = useState(false);
  // Android multiline inputs grow with content natively; only iOS needs a
  // measured height. Never mutate layout of the focused input on Android —
  // under Fabric that recreates the native view and drops focus.
  const [iosHeight, setIosHeight] = useState(minHeight);

  const length = value?.length ?? 0;
  const belowMin = !!minLength && length > 0 && length < minLength;
  const nearMax = !!maxLength && length >= Math.floor(maxLength * 0.9);
  const atMax = !!maxLength && length >= maxLength;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.wrapper,
          focused && styles.wrapperFocused,
          !!error && styles.wrapperError,
        ]}
      >
        <TextInput
          multiline
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onContentSizeChange={
            Platform.OS === 'ios'
              ? (e) => {
                  const next = Math.max(minHeight, Math.min(maxHeight, e.nativeEvent.contentSize.height + 16));
                  setIosHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
                }
              : undefined
          }
          placeholder={placeholder}
          placeholderTextColor={Colors.outline}
          style={[
            styles.input,
            Platform.OS === 'ios' ? { height: iosHeight } : { minHeight, maxHeight },
          ]}
          textAlignVertical="top"
          {...props}
        />
      </View>
      <View style={styles.footer}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : minLength ? (
          <Text style={[styles.hint, belowMin && styles.hintWarn]}>
            {length === 0
              ? `Minimum ${minLength} characters`
              : belowMin
              ? `${minLength - length} more character${minLength - length === 1 ? '' : 's'} needed`
              : 'Looks good'}
          </Text>
        ) : (
          <View />
        )}
        {!!maxLength && (
          <Text style={[styles.counter, nearMax && styles.counterWarn, atMax && styles.counterMax]}>
            {length}/{maxLength}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  wrapper: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    ...Platform.select({
      ios: {
        shadowColor: '#006496',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {},
    }),
  },
  // Focus style must only change paint-level props (color). Toggling
  // elevation here changes Fabric's view-flattening decision on Android,
  // which recreates the native subtree and remounts the TextInput —
  // instantly dropping focus and closing the keyboard.
  wrapperFocused: {
    borderColor: Colors.primary,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowOpacity: 0.12, shadowRadius: 8 },
      android: {},
    }),
  },
  wrapperError: { borderColor: Colors.error },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginHorizontal: 4,
  },
  hint: { color: Colors.textMuted, fontSize: 11 },
  hintWarn: { color: Colors.tertiary },
  error: { color: Colors.error, fontSize: 12 },
  counter: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  counterWarn: { color: Colors.statusYellow },
  counterMax: { color: Colors.error },
});
