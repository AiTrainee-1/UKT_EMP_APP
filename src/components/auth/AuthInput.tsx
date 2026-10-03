import React, { forwardRef, useMemo, useState } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, Platform, type TextInputProps, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { AuthColors, AuthFont } from './authTheme';

interface AuthInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
  leftIconName?: string;
}

/**
 * The sign-in screens' field: a soft filled box with an icon, and a small capitalised label above it. The same props as the
 * shared `Input` (so the screens only swap the name), restyled for the login pages; the shared `Input` is untouched.
 */
export const AuthInput = forwardRef<TextInput, AuthInputProps>(
  ({ label, error, containerStyle, rightIcon, isPassword, leftIconName, value, ...props }, ref) => {
    const { C: Colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(Colors, isDark), [Colors, isDark]);
    const [focused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={[styles.wrapper, focused && styles.wrapperFocused, !!error && styles.wrapperError]}>
          {leftIconName && (
            <MaterialCommunityIcons
              name={leftIconName as any}
              size={19}
              color={focused ? AuthColors.accent : Colors.outline}
              style={styles.leftIcon}
            />
          )}
          <TextInput
            ref={ref}
            style={[styles.input, leftIconName && styles.inputNoLeft]}
            placeholderTextColor={Colors.outline}
            selectionColor={AuthColors.accent}
            cursorColor={AuthColors.accent}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            secureTextEntry={isPassword && !showPassword}
            value={value ?? ''}
            {...props}
          />
          {isPassword && (
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.trailing}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.outline} />
            </TouchableOpacity>
          )}
          {!isPassword && rightIcon && <View style={styles.trailing}>{rightIcon}</View>}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  },
);

AuthInput.displayName = 'AuthInput';

const makeStyles = (Colors: Palette, isDark = false) =>
  StyleSheet.create({
    container: { marginBottom: 14 },
    label: {
      color: Colors.textSecondary,
      fontFamily: AuthFont.bodyBold,
      fontSize: 11,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      marginBottom: 7,
      marginLeft: 2,
    },
    // Light mode: a soft mint-grey fill with a hairline edge, so the box shows against the white sheet.
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? Colors.bgInput : '#F0F6F5',
      borderWidth: 1.5,
      borderColor: isDark ? 'transparent' : '#E0EBE9',
      borderRadius: 16,
    },
    wrapperFocused: { borderColor: AuthColors.accent, backgroundColor: Colors.bgCard },
    wrapperError: { borderColor: Colors.error },
    leftIcon: { marginLeft: 15 },
    input: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 15,
      color: Colors.textPrimary,
      fontFamily: AuthFont.bodySemi,
      fontSize: 15,
      // The box around it shows focus; stop the browser (web preview only) drawing its own outline inside it.
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
    },
    inputNoLeft: { paddingLeft: 10 },
    trailing: { padding: 12 },
    error: { color: Colors.error, fontFamily: AuthFont.body, fontSize: 12, marginTop: 5, marginLeft: 3 },
  });
