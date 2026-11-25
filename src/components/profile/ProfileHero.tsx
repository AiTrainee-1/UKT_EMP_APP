import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { initialsOf } from '../../lib/profileView';

/**
 * The top of the Profile page (owner 2026-11-25 redesign): the photo with its change-photo button, name (with the
 * verified mark once the employee has set a password), designation and role, department and branch, and two pills: the
 * employment status and the employee code. Drawn on the deep "royal" gradient in both themes, so its text is white.
 */
export function ProfileHero({
  name,
  photoUri,
  verified,
  roleLine,
  placeLine,
  statusText,
  statusActive,
  code,
  savingPhoto,
  onPickPhoto,
  hasLocalPhoto,
}: {
  name?: string | null;
  photoUri?: string | null;
  verified: boolean;
  roleLine: string;
  placeLine: string;
  statusText: string;
  statusActive: boolean;
  code?: string | null;
  savingPhoto: boolean;
  onPickPhoto: () => void;
  hasLocalPhoto: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = !!photoUri && photoUri !== failedUri;

  return (
    <LinearGradient colors={C.gradientRoyal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.deco1} />
      <View style={styles.deco2} />
      <View style={styles.deco3} />

      <Pressable
        onPress={onPickPhoto}
        disabled={savingPhoto}
        style={({ pressed }) => [styles.avatarWrap, pressed && { transform: [{ scale: 0.97 }] }]}
        accessibilityRole="button"
        accessibilityLabel={hasLocalPhoto ? 'Change or remove your profile photo' : 'Change your profile photo'}
      >
        <View style={styles.avatarRing}>
          {showImage ? (
            <Image
              source={{ uri: photoUri! }}
              style={styles.avatarImg}
              onError={() => setFailedUri(photoUri ?? null)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.avatarImg, styles.avatarFallback]}>
              <Text style={styles.initials}>{initialsOf(name) || 'EM'}</Text>
            </View>
          )}
        </View>
        <View style={styles.cameraBadge}>
          {savingPhoto ? (
            <ActivityIndicator size="small" color={C.onPrimary} />
          ) : (
            <MaterialCommunityIcons name="camera-outline" size={15} color={C.onPrimary} />
          )}
        </View>
      </Pressable>

      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={2}>
          {name ?? ''}
        </Text>
        {verified && <MaterialCommunityIcons name="check-decagram" size={18} color="#93C5FD" />}
      </View>
      {!!roleLine && (
        <Text style={styles.role} numberOfLines={1}>
          {roleLine}
        </Text>
      )}
      {!!placeLine && (
        <View style={styles.placeRow}>
          <MaterialCommunityIcons name="domain" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.place} numberOfLines={1}>
            {placeLine}
          </Text>
        </View>
      )}

      <View style={styles.pills}>
        <View style={[styles.pill, statusActive ? styles.pillOk : styles.pillWarn]}>
          <View style={[styles.dot, { backgroundColor: statusActive ? '#34D399' : '#FBBF24' }]} />
          <Text style={styles.pillText}>{statusText}</Text>
        </View>
        {!!code && (
          <View style={styles.pill}>
            <MaterialCommunityIcons name="pound" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.pillText}>{code}</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const AVATAR = 92;

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    hero: {
      marginHorizontal: 16,
      borderRadius: BorderRadius.xxl,
      paddingTop: 24,
      paddingBottom: 20,
      paddingHorizontal: 20,
      alignItems: 'center',
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 20 },
        android: { elevation: 8 },
      }),
    },
    deco1: { position: 'absolute', top: -50, right: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.08)' },
    deco2: { position: 'absolute', bottom: -40, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
    deco3: { position: 'absolute', top: 30, left: 28, width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)' },
    avatarWrap: { marginBottom: 12 },
    avatarRing: {
      width: AVATAR + 8,
      height: AVATAR + 8,
      borderRadius: (AVATAR + 8) / 2,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    avatarImg: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
    avatarFallback: { backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    initials: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 32, letterSpacing: 0.5 },
    cameraBadge: {
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.primary,
      borderWidth: 3,
      borderColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
    name: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 22, letterSpacing: -0.3, textAlign: 'center', flexShrink: 1 },
    role: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, textAlign: 'center' },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, maxWidth: '100%' },
    place: { color: 'rgba(255,255,255,0.7)', fontSize: 12, flexShrink: 1 },
    pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    pillOk: { backgroundColor: 'rgba(52,211,153,0.2)' },
    pillWarn: { backgroundColor: 'rgba(251,191,36,0.22)' },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    pillText: { color: '#fff', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
  });
