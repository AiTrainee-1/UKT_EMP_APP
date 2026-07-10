import React, { useState, forwardRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  ViewStyle,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { BorderRadius } from '../../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
  leftIconName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, containerStyle, rightIcon, isPassword, leftIconName, value, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View
          style={[
            styles.inputWrapper,
            focused && styles.inputWrapperFocused,
            !!error && styles.inputWrapperError,
          ]}
        >
          {leftIconName && (
            <MaterialCommunityIcons
              name={leftIconName as any}
              size={18}
              color={focused ? Colors.primary : Colors.outline}
              style={styles.leftIcon}
            />
          )}
          <TextInput
            ref={ref}
            style={[styles.input, leftIconName && styles.inputNoLeft]}
            placeholderTextColor={Colors.outline}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            secureTextEntry={isPassword && !showPassword}
            value={value ?? ''}
            {...props}
          />
          {isPassword && (
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.outline}
              />
            </TouchableOpacity>
          )}
          {!isPassword && rightIcon && (
            <View style={styles.eyeButton}>{rightIcon}</View>
          )}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // Only paint-level props here — toggling elevation on focus makes Fabric
  // re-flatten the wrapper on Android, remounting the TextInput and
  // dropping focus (keyboard opens then instantly closes).
  inputWrapperFocused: {
    borderColor: Colors.primary,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {},
    }),
  },
  inputWrapperError: {
    borderColor: Colors.error,
  },
  leftIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  inputNoLeft: {
    paddingLeft: 8,
  },
  eyeButton: {
    padding: 12,
  },
  error: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
