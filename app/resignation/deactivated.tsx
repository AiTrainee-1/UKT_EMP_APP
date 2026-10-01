import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  StatusBar,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { Colors } from '../../src/constants/colors';
import { UKTLogo } from '../../src/components/UKTLogo';
import { SupportContactCard } from '../../src/components/support/SupportContactCard';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { useSupportContact } from '../../src/hooks/useSupportContact';
import { contactFor } from '../../src/lib/supportContact';

export default function AccountDeactivatedScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // HR's own contact details (HR portal -> Settings -> HR Contact). The employee is already signed
  // out here; the lookup needs no sign-in, and falls back to the copy saved on the phone.
  const { contact } = useSupportContact();
  const hrEmail = contactFor(contact, 'hr')?.email ?? '';

  // Auth is already cleared by the time this screen mounts (see the
  // ResignationGuard in app/_layout.tsx), so the name and last working date
  // are handed in as route params captured right before logout — not
  // re-fetched here, since there's no session left to fetch with.
  const { name, lastWorkingDate } = useLocalSearchParams<{ name?: string; lastWorkingDate?: string }>();

  const fade = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const formattedLastDay = lastWorkingDate
    ? format(new Date(lastWorkingDate + 'T00:00:00'), 'dd MMM yyyy')
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <View style={styles.header}>
        <UKTLogo size={28} />
        <View>
          <Text style={styles.brandName}>UKTEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.statePill}>
          <View style={styles.statePillDot} />
          <Text style={styles.statePillText}>Terminal State</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slideUp }] }}>
          {/* Lock icon bubble */}
          <View style={styles.iconOuter}>
            <View style={styles.iconInner}>
              <MaterialCommunityIcons name="lock-outline" size={44} color="#fff" />
            </View>
          </View>

          {/* Text */}
          <View style={styles.textBlock}>
            <Text style={styles.title}>Account Deactivated</Text>
            <Text style={styles.subtitle}>
              Your resignation has been approved and your account access has been revoked.
            </Text>
          </View>

          {(name || formattedLastDay) && (
            <View style={styles.idChip}>
              {!!name && <Text style={styles.idChipName}>{name}</Text>}
              {!!name && !!formattedLastDay && <Text style={styles.idChipDot}>•</Text>}
              {!!formattedLastDay && (
                <Text style={styles.idChipDate}>Relieved {formattedLastDay}</Text>
              )}
            </View>
          )}

          {/* Warning banner */}
          <View style={styles.warnBanner}>
            <View style={styles.warnIcon}>
              <MaterialCommunityIcons name="alert" size={18} color={Colors.statusRed} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Official Separation Finalized</Text>
              <Text style={styles.warnBody}>
                Access to attendance punching, leave requests, and self-service features has ended.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>SEPARATION DETAILS</Text>

          {/* Info cards */}
          <View style={styles.cardsWrap}>
            {[
              {
                icon: 'archive-outline',
                iconColor: Colors.primary,
                bg: Colors.badgeBlueBg,
                title: 'Records Archived',
                text: 'Your employment records and self-service logins have been permanently archived.',
                pill: 'Permanent',
                pillBg: Colors.bgSurfaceLow,
                pillColor: Colors.textMuted,
              },
              {
                icon: 'wallet-outline',
                iconColor: Colors.statusGreen,
                bg: Colors.badgeGreenBg,
                title: 'Final Settlement',
                text: 'Full & final settlement and dues will be processed as per company policy.',
                pill: 'In Progress',
                pillBg: Colors.badgeGreenBg,
                pillColor: Colors.statusGreen,
              },
              {
                icon: 'email-outline',
                iconColor: Colors.categoryTracking,
                bg: Colors.badgeBlueBg,
                title: 'HR Support Desk',
                text: hrEmail
                  ? `For queries about settlement or documents, contact HR at ${hrEmail}.`
                  : 'For queries about settlement or documents, please contact your HR department.',
                pill: 'Support',
                pillBg: Colors.badgeBlueBg,
                pillColor: Colors.categoryTracking,
              },
            ].map(({ icon, iconColor, bg, title, text, pill, pillBg, pillColor }, i) => (
              <View key={i} style={styles.infoCard}>
                <View style={[styles.infoIcon, { backgroundColor: bg }]}>
                  <MaterialCommunityIcons name={icon as any} size={18} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.infoTopRow}>
                    <Text style={styles.infoTitle}>{title}</Text>
                    <View style={[styles.infoPill, { backgroundColor: pillBg }]}>
                      <Text style={[styles.infoPillText, { color: pillColor }]}>{pill}</Text>
                    </View>
                  </View>
                  <Text style={styles.infoText}>{text}</Text>
                </View>
              </View>
            ))}
          </View>

          <SupportContactCard situation="hr" compact showNote style={styles.hrCard} />
          {/* CTA */}
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="arrow-left" size={18} color="#fff" />
            <Text style={styles.loginBtnText}>Go to Login</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 12, letterSpacing: 0.2 },
  brandSub: { color: Colors.textMuted, fontSize: 7.5, fontWeight: '700', letterSpacing: 0.6 },
  statePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.badgeRedBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.statusRed },
  statePillText: { color: Colors.statusRed, fontSize: 10, fontWeight: '800' },

  scrollContent: { padding: 24, paddingBottom: 40, alignItems: 'center' },

  iconOuter: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.statusRed,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 12, marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: Colors.statusRed, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  iconInner: { alignItems: 'center', justifyContent: 'center' },

  textBlock: { alignItems: 'center', gap: 8, marginBottom: 16 },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 24, textAlign: 'center' },
  subtitle: { color: Colors.textSecondary, fontSize: 13.5, textAlign: 'center', lineHeight: 20, maxWidth: 300 },

  idChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16, paddingVertical: 9,
    marginBottom: 20,
  },
  idChipName: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  idChipDot: { color: Colors.outline, fontSize: 13 },
  idChipDate: { color: Colors.statusGreen, fontFamily: FontFamily.bodySemibold, fontSize: 13 },

  warnBanner: {
    flexDirection: 'row', gap: 10,
    backgroundColor: Colors.badgeRedBg,
    borderRadius: BorderRadius.lg,
    padding: 14,
    width: '100%',
    marginBottom: 20,
  },
  warnIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  warnTitle: { color: Colors.statusRed, fontFamily: FontFamily.headlineSemibold, fontSize: 13.5, marginBottom: 3 },
  warnBody: { color: Colors.statusRed, fontSize: 12, lineHeight: 17, opacity: 0.85 },

  sectionLabel: { alignSelf: 'flex-start', color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },

  cardsWrap: { width: '100%', gap: 10, marginBottom: 16 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...cardShadow,
  },
  infoIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 },
  infoTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  infoPill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  infoPillText: { fontSize: 9.5, fontWeight: '800' },
  infoText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },

  hrCard: { width: '100%', marginBottom: 20 },

  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
