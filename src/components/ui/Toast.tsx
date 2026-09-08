import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  visible: boolean;
}

const makeTypeConfig = (Colors: Palette) => ({
  success: { bg: '#e8f5e9', border: '#a5d6a7', text: '#1b5e20', icon: 'check-circle-outline' as const, iconColor: '#2e7d32' },
  error:   { bg: '#ffebee', border: '#ef9a9a', text: '#b71c1c', icon: 'alert-circle-outline' as const, iconColor: '#c62828' },
  info:    { bg: Colors.primaryFixed, border: Colors.primaryLight, text: Colors.onPrimaryContainer, icon: 'information-outline' as const, iconColor: Colors.primary },
});

export function Toast({ message, type = 'success', visible }: ToastProps) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const typeConfig = makeTypeConfig(Colors);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const cfg = typeConfig[type];

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: cfg.bg, borderColor: cfg.border, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <MaterialCommunityIcons name={cfg.icon} size={20} color={cfg.iconColor} />
      <Text style={[styles.text, { color: cfg.text }]}>{message}</Text>
    </Animated.View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#006496',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
