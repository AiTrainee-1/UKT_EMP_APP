import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import type { PermissionLevel } from '../../tracking/types';
import { trackingRoutes } from '../../tracking/routes';

interface Props {
  /** The phone's location permission, or 'unknown' before it has been read (and always in a browser). */
  permission: PermissionLevel;
}

/**
 * Step 1's "is the route going to be recorded?" line, shown before the request is sent: what the phone's location permission
 * is, and a way to fix it. (The tracking notice has its own red gate above it.) Nothing while the permission is not known.
 */
export function TrackingReadiness({ permission }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (permission === 'unknown') return null;

  const ok = permission === 'always';
  const denied = permission === 'denied';
  const title = ok ? 'Route tracking is ready' : denied ? 'Location is off for UKTextiles' : 'Location works only while the app is open';
  const body = ok
    ? 'Location is allowed all the time, so your route keeps being recorded with the screen off.'
    : denied
      ? 'Allow location, otherwise your On-Duty route cannot be recorded.'
      : 'Choose "Allow all the time" so tracking keeps working when the screen is off.';
  const color = ok ? C.statusGreen : denied ? C.statusRed : C.statusYellow;
  const bg = ok ? C.badgeGreenBg : denied ? C.badgeRedBg : C.badgeYellowBg;
  const text = ok ? C.badgeGreenText : denied ? C.badgeRedText : C.badgeYellowText;

  const content = (
    <>
      <MaterialCommunityIcons name={ok ? 'shield-check' : denied ? 'alert-circle' : 'alert'} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.body, { color: text }]}>{body}</Text>
      </View>
      {!ok && (
        <View style={styles.fix}>
          <Text style={[styles.fixText, { color }]}>{denied ? 'Allow' : 'Fix'}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={color} />
        </View>
      )}
    </>
  );

  if (ok) {
    return (
      <View style={[styles.box, { backgroundColor: bg }]} accessible accessibilityLabel={`${title}. ${body}`}>
        {content}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.box, { backgroundColor: bg }]}
      onPress={() => router.push(trackingRoutes.setup(denied ? 'foreground' : 'background'))}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
    >
      {content}
    </TouchableOpacity>
  );
}

const makeStyles = (_C: Palette) =>
  StyleSheet.create({
    box: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: BorderRadius.md, padding: 10 },
    title: { fontSize: 12.5, fontWeight: '800' },
    body: { fontSize: 11.5, lineHeight: 16, marginTop: 1 },
    fix: { flexDirection: 'row', alignItems: 'center' },
    fixText: { fontSize: 12, fontWeight: '800' },
  });
