import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { useGeoPunchStatus } from '../hooks/useGeoAttendance';

/**
 * Compact status banner on the Attendance tab — the real punch interaction
 * (location gating, the 4-slot timeline, camera capture) lives on its own
 * dedicated screen (app/geo-punch), which gives it room to show punch
 * status clearly and makes the location/camera permission prompts happen
 * from an explicit button tap rather than a background effect.
 */
export function GeoPunchCard() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { data: status } = useGeoPunchStatus();
  // Office punches are uncapped now -report what has been recorded rather
  // than counting down to a limit that no longer exists.
  const punchCount = status?.punches?.length ?? 0;
  const nextType = status?.nextPunchType;
  const session = status?.onDutySession;
  // A submitted request reads as "active" -punching starts immediately.
  const isOnDuty = session != null && session.status === 'active';
  const openSlots = (status?.punchSlots ?? []).filter((sl) => sl.available).length;

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => router.push(isOnDuty ? '/on-duty' : '/geo-punch')}
      activeOpacity={0.8}
    >
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons
          name={isOnDuty ? 'briefcase-outline' : 'map-marker-radius'}
          size={18}
          color={isOnDuty ? Colors.tertiary : Colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{isOnDuty ? 'On-Duty' : 'Attendance Request'}</Text>
        <Text style={styles.subtitle}>
          {isOnDuty
            ? openSlots === 0
              ? 'All 4 punches recorded — session ended'
              : `Active — ${4 - openSlots} of 4 punches recorded`
            : punchCount === 0
              ? 'No punches yet today'
              : `${punchCount} punch${punchCount === 1 ? '' : 'es'} today · next is ${nextType === 'IN' ? 'Check-In' : 'Check-Out'}`}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.badgeBlueBg,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  subtitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
});
