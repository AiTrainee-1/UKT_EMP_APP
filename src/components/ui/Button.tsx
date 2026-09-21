import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Platform,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { ClayElevation, BorderRadius } from '../../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost' | 'secondary';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
  icon,
}: ButtonProps) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  const inner = loading ? (
    <ActivityIndicator color={variant === 'primary' ? '#fff' : Colors.primary} size="small" />
  ) : (
    <View style={styles.row}>
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text style={[styles.text, variant !== 'primary' && styles.textDark, textStyle]}>{title}</Text>
    </View>
  );

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[
          styles.touchable,
          variant === 'outline' && styles.outline,
          variant === 'ghost' && styles.ghost,
          variant === 'secondary' && styles.secondary,
          (disabled || loading) && styles.disabled,
        ]}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={Colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, ...(ClayElevation.button ? [ClayElevation.button as ViewStyle] : [])]}
          >
            {inner}
          </LinearGradient>
        ) : (
          <View style={styles.inner}>{inner}</View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  touchable: {
    borderRadius: BorderRadius.full,
    overflow: 'visible',
  },
  gradient: {
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  inner: {
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  outline: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
      },
      android: { elevation: 1 },
    }),
  },
  ghost: {
    backgroundColor: Colors.bgSurfaceLow,
  },
  secondary: {
    backgroundColor: Colors.secondaryContainer,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
      },
      android: { elevation: 1 },
    }),
  },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { marginRight: 2 },
  text: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  textDark: { color: Colors.textPrimary },
});
