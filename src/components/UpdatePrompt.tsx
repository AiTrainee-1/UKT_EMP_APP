import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSegments } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useAppUpdate, type AppUpdate } from '../hooks/useAppUpdate';
import { APP_VERSION } from '../lib/appVersion';
import { useReduceMotion } from '../lib/motionPrefs';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { FontFamily } from '../constants/typography';
import { MangaButton, MangaFrame, MangaLink, MangaPanel, Mascot, SpeechBubble, makeMangaStyles, useMangaMotion } from './manga';

type Latest = NonNullable<AppUpdate['latest']>;

/**
 * "New version" popup, shown over every screen (the login page included) whenever HR has published a newer build than the
 * one that is running. It stays until the employee does something about it.
 *
 * "Update now" opens the APK link HR published; the phone downloads it and the employee taps it to install. A required
 * update has no way to dismiss it. An optional one can be put off with "Later", which only lasts until the app is next
 * opened.
 *
 * The look (owner 2026-11-25): a 2D anime / manga card - an original chibi mascot (a little thread-spool character, drawn
 * here with react-native-svg) in a manga panel with focus lines and halftone dots, a speech bubble, current -> new version
 * badges and the release notes. It pops in with a bounce, the mascot waves and blinks, sparkles twinkle; under Reduce
 * Motion it simply fades in and stays still.
 *
 * Its pieces (the mascot, the panel art, the bubble, the buttons, the motion) now live in the shared manga kit,
 * src/components/manga, which the app tour and the notification / location / permission popups use too (owner
 * 2026-11-25).
 */
export function UpdatePrompt() {
  const { data } = useAppUpdate();
  const segments = useSegments();
  const [postponed, setPostponed] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const latest = data?.latest;
  if (!data?.updateAvailable || !latest) return null;
  // Not over the startup animation: the prompt appears as soon as the app has moved on to its first screen.
  // (The root route has no segments; the typed-routes tuple type just doesn't admit an empty one.)
  if ((segments as string[]).length === 0) return null;
  if (!latest.mandatory && postponed === latest.version) return null;

  const download = async () => {
    setOpening(true);
    try {
      await Linking.openURL(latest.downloadUrl);
    } catch {
      Alert.alert('Could not open the download', 'Please check your internet connection and try again, or ask HR for the new app.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <UpdateCard
      key={latest.version}
      latest={latest}
      opening={opening}
      onUpdate={() => { void download(); }}
      onLater={() => setPostponed(latest.version)}
    />
  );
}

// ── the card ────────────────────────────────────────────────────────────────

const PANEL_H = 178;

function UpdateCard({
  latest,
  opening,
  onUpdate,
  onLater,
}: {
  latest: Latest;
  opening: boolean;
  onUpdate: () => void;
  onLater: () => void;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const manga = useThemedStyles(makeMangaStyles);
  const reduce = useReduceMotion();
  const notes = latest.releaseNotes?.trim() ?? '';
  const motion = useMangaMotion({ reduce });
  const { glow } = motion;

  const newBadgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + glow.value * 0.05 }] }));

  const ink = C.textPrimary;

  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="update-prompt">
      <Animated.View style={[StyleSheet.absoluteFill, manga.backdrop, motion.backdropStyle]} />
      <Animated.View style={[styles.cardWrap, motion.cardStyle]}>
        <MangaFrame shadowColor={C.primary}>
          {/* ── panel 1: the mascot ── */}
          <MangaPanel
            height={PANEL_H}
            paper={C.primaryFixed}
            dots={C.primary}
            // centred on the mascot's face (its left 26 + 60 drawing units, its top 54 + 58 units)
            focus={{ x: 78, y: 104 }}
            spin={motion.spin}
            sparkle={reduce ? null : motion.sparkle}
          >
            <Animated.View style={[styles.mascot, motion.mascotStyle]}>
              <Mascot wave={motion.wave} blink={motion.blink} />
            </Animated.View>

            <SpeechBubble style={styles.bubble} animatedStyle={motion.bubbleStyle}>
              <Text style={manga.bubbleText}>A new version is here!</Text>
            </SpeechBubble>

            {latest.mandatory && (
              <View style={styles.stamp} accessible accessibilityLabel="This update is required">
                <Text style={styles.stampText}>MUST UPDATE</Text>
              </View>
            )}
          </MangaPanel>

          {/* ── panel 2: the words ── */}
          <View style={styles.body}>
            <Text style={manga.title} accessibilityRole="header">Update time!</Text>
            <Text style={manga.sub}>A new version of the app is ready for you.</Text>

            <View style={styles.versions} accessible accessibilityLabel={`You have version ${APP_VERSION}. New version ${latest.version}.`}>
              <View style={styles.versionCol}>
                <Text style={styles.versionLabel}>You have</Text>
                <View style={styles.oldBadge}>
                  <Text style={styles.oldBadgeText}>v{APP_VERSION}</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="arrow-right-bold" size={22} color={ink} style={styles.versionArrow} />
              <View style={styles.versionCol}>
                <Text style={[styles.versionLabel, { color: C.primary }]}>New</Text>
                <Animated.View style={newBadgeStyle}>
                  <View style={styles.newBadgeShadow} />
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>v{latest.version}</Text>
                  </View>
                </Animated.View>
              </View>
            </View>

            {notes !== '' && (
              <View style={[manga.note, styles.notes]}>
                <Text style={styles.notesLabel}>What's new</Text>
                <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  <Text style={styles.notesText}>{notes}</Text>
                </ScrollView>
              </View>
            )}

            <MangaButton
              label={opening ? 'Opening…' : 'Update now'}
              icon="download"
              onPress={onUpdate}
              disabled={opening}
              busy={opening}
              accessibilityLabel="Update now"
              style={styles.btnWrap}
              testID="update-prompt-update"
            />
            <Text style={styles.hint}>
              When the download finishes, open the file and tap Install. If Android asks, allow installing from this source.
            </Text>

            {!latest.mandatory && <MangaLink label="Later" onPress={onLater} testID="update-prompt-later" />}
          </View>
        </MangaFrame>
      </Animated.View>
    </View>
  );
}

const makeStyles = (C: Palette) => {
  const ink = C.textPrimary;
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      // Above the permission popup: an update is worth doing first.
      zIndex: 1000,
      elevation: 1000,
    },
    cardWrap: { width: '100%', maxWidth: 360 },

    mascot: { position: 'absolute', left: 26, bottom: -6 },
    bubble: { position: 'absolute', top: 16, right: 14, maxWidth: 160 },
    stamp: {
      position: 'absolute',
      right: 14,
      bottom: 14,
      borderWidth: 2.5,
      borderColor: C.statusRed,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: C.bgCard,
      transform: [{ rotate: '-8deg' }],
    },
    stampText: { color: C.statusRed, fontFamily: FontFamily.displayBold, fontSize: 11, letterSpacing: 1.2 },

    body: { padding: 18, paddingTop: 16 },

    versions: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 14 },
    versionCol: { gap: 5 },
    versionLabel: { color: C.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
    versionArrow: { marginBottom: 7 },
    oldBadge: {
      borderWidth: 2,
      borderColor: C.outline,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: C.bgSurfaceLow,
    },
    oldBadgeText: { color: C.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    newBadgeShadow: {
      ...StyleSheet.absoluteFill,
      top: 3,
      left: 3,
      right: -3,
      bottom: -3,
      borderRadius: 10,
      backgroundColor: ink,
    },
    newBadge: {
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: C.primary,
    },
    newBadgeText: { color: C.onPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },

    notes: { marginTop: 14 },
    notesLabel: { color: C.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
    notesScroll: { maxHeight: 108 },
    notesText: { color: C.textPrimary, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, lineHeight: 18 },

    btnWrap: { marginTop: 16, marginRight: 4, marginBottom: 4 },
    hint: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 10 },
  });
};
