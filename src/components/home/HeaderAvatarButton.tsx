import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../../hooks/useAuth';
import { useEmployee } from '../../hooks/useEmployee';
import { useLocalProfilePhoto } from '../../hooks/useLocalProfilePhoto';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily } from '../../constants/typography';

function initialsOf(name?: string | null): string {
  return (name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The round profile button at the right of a main screen's top bar (owner 2026-11-25: it showed a plain person icon,
 * never the person). Shows the same photo as the Home profile card and Profile: the one chosen on this phone
 * (useLocalProfilePhoto), else the official HR photo from the employee's own record (GET /employees/:id, a data URL that
 * needs no sign-in header and is cached by React Query). Initials while that loads or when there is no photo, the
 * person icon until the name is known. Opens Profile.
 */
export function HeaderAvatarButton({
  ref,
  size = 32,
  style,
}: {
  ref?: React.Ref<ViewInstance>;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const { data: emp } = useEmployee(employeeId);
  const local = useLocalProfilePhoto(employeeId);
  const uri = local.photo ?? emp?.photoUrl ?? null;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = !!uri && uri !== failedUri;
  const initials = initialsOf(emp?.name ?? user?.name);
  const radius = size / 2;

  return (
    <Pressable
      ref={ref}
      onPress={() => router.push('/(tabs)/profile')}
      hitSlop={6}
      style={({ pressed }) => [
        styles.ring,
        { width: size + 4, height: size + 4, borderRadius: radius + 2 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel="My Profile"
    >
      <View style={[styles.inner, { width: size, height: size, borderRadius: radius }]}>
        {showImage ? (
          <Image
            source={{ uri: uri! }}
            style={{ width: size, height: size, borderRadius: radius }}
            onError={() => setFailedUri(uri)}
            accessibilityIgnoresInvertColors
          />
        ) : initials ? (
          <Text style={[styles.initials, { fontSize: size * 0.38, color: Colors.onPrimary }]}>{initials}</Text>
        ) : (
          <MaterialCommunityIcons name="account" size={size * 0.6} color={Colors.onPrimary} />
        )}
      </View>
    </Pressable>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    ring: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: Colors.primaryFixed,
    },
    inner: {
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    initials: { fontFamily: FontFamily.displayBold, letterSpacing: 0.3 },
  });
