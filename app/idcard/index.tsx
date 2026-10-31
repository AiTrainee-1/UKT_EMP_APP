import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  ScrollView,
  Share,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useAuth } from '../../src/hooks/useAuth';
import { useIdCard, useIdCardSettings, type IdCardData, type IdCardTemplate } from '../../src/hooks/useIdCard';
import { useEmployee } from '../../src/hooks/useEmployee';
import { UKTLogo } from '../../src/components/UKTLogo';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Reveal } from '../../src/components/Reveal';
import { RetryPanel } from '../../src/components/documents/RetryPanel';
import { FlipCard, type FlipCardHandle } from '../../src/components/idcard/FlipCard';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { useReduceMotion } from '../../src/lib/motionPrefs';
import { employeeStatusInfo, idCardHeight, idCardWidth, shareMessage, verifyUrl } from '../../src/lib/idCard';

const DEFAULT_TEMPLATE: IdCardTemplate = { primaryColor: '#1E3A8A', secondaryColor: '#2563EB', showQrOnBack: true };

export default function IdCardScreen() {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();

  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const cardQ = useIdCard(employeeId);
  const settingsQ = useIdCardSettings();
  const empQ = useEmployee(employeeId);
  const emp = empQ.data;

  // Fall back to the general employee record if the dedicated ID card endpoint isn't reachable.
  const data: IdCardData | null =
    cardQ.data ??
    (emp
      ? {
          id: emp.id,
          code: emp.employeeCode,
          name: emp.name,
          designation: emp.designationTitle,
          department: emp.departmentName,
          employmentType: emp.employmentType,
          photoUrl: emp.photoUrl ?? null,
          bloodGroup: emp.bloodGroup,
          dateOfBirth: emp.dateOfBirth,
          emergencyContact: emp.emergencyContact,
          address: emp.address,
          phone: emp.phone,
          email: emp.email,
          joinDate: emp.joinDate,
          status: emp.status,
          company: settingsQ.data?.company,
          template: settingsQ.data?.template ?? DEFAULT_TEMPLATE,
        }
      : null);

  const loading = !data && (cardQ.isLoading || empQ.isLoading);
  const failed = !data && !loading;
  const retrying = cardQ.isFetching || empQ.isFetching;
  const retry = () => {
    void cardQ.refetch();
    void empQ.refetch();
    void settingsQ.refetch();
  };

  const isProduction = data?.employmentType === 'production';
  const cardW = idCardWidth(windowWidth, isProduction);
  const template = data?.template ?? DEFAULT_TEMPLATE;
  const qrValue = verifyUrl(process.env.EXPO_PUBLIC_WEB_APP_URL, process.env.EXPO_PUBLIC_API_URL, data?.code);
  const status = employeeStatusInfo(data?.status);
  const inactiveLabel = status.kind === 'ended' ? status.label : null;

  const flipRef = useRef<FlipCardHandle>(null);
  const [side, setSide] = useState<'front' | 'back'>('front');

  const handleShare = () => {
    if (!data) return;
    void Share.share({ message: shareMessage(data, qrValue, status) }).catch(() => {});
  };

  const statusChip = (() => {
    if (status.kind === 'unknown') return null;
    const tone =
      status.kind === 'active'
        ? { bg: C.badgeGreenBg, fg: C.badgeGreenText, dot: C.statusGreen }
        : status.kind === 'ended'
          ? { bg: C.badgeRedBg, fg: C.badgeRedText, dot: C.statusRed }
          : { bg: C.badgeBlueBg, fg: C.badgeBlueText, dot: C.statusBlue };
    return (
      <View
        style={[styles.chip, { backgroundColor: tone.bg }]}
        accessible
        accessibilityLabel={`Employment status from HR: ${status.label}`}
      >
        <View style={[styles.chipDot, { backgroundColor: tone.dot }]} />
        <Text style={[styles.chipText, { color: tone.fg }]}>{status.label}</Text>
      </View>
    );
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} accessibilityRole="header">Digital ID Card</Text>
          <Text style={styles.headerSubtitle}>Show this when someone asks for your ID</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.8 }]}
          onPress={() => router.push('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open my profile"
          hitSlop={6}
        >
          <MaterialCommunityIcons name="account" size={18} color={C.onPrimary} />
        </Pressable>
      </View>

      {failed ? (
        <RetryPanel
          title="Couldn’t load your ID card"
          message="Check your internet connection, then try again."
          onRetry={retry}
          retrying={retrying}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={!!data && retrying && !loading} onRefresh={retry} tintColor={C.primary} colors={[C.primary]} />
          }
        >
          <Reveal index={0} style={styles.fullWidth}>
            <View style={styles.titleRow}>
              <View style={styles.brand}>
                <UKTLogo size={26} />
                <View>
                  <Text style={styles.titleText}>{isProduction ? 'Production Credential' : 'Staff Credential'}</Text>
                  <Text style={styles.titleSub}>{data?.company?.name || 'UK Textiles'}</Text>
                </View>
              </View>
              {statusChip}
            </View>
          </Reveal>

          {inactiveLabel && (
            <Reveal index={1} style={styles.fullWidth}>
              <View style={styles.warn} accessibilityLiveRegion="polite">
                <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={C.badgeRedText} />
                <Text style={styles.warnText}>
                  HR’s records show your status as <Text style={styles.warnStrong}>{inactiveLabel}</Text>. This card is
                  not valid for entry or verification. If this is wrong, please contact HR.
                </Text>
              </View>
            </Reveal>
          )}

          <View style={styles.cardArea}>
            {loading || !data ? (
              <View accessible accessibilityLabel="Loading your ID card">
                <Skeleton width={cardW} height={idCardHeight(cardW, isProduction)} borderRadius={18} />
              </View>
            ) : (
              <MotiView
                from={reduceMotion ? { opacity: 1 } : { opacity: 0, translateY: 24, rotateX: '12deg' }}
                animate={{ opacity: 1, translateY: 0, rotateX: '0deg' }}
                transition={{ type: 'spring', damping: 16, stiffness: 120 }}
              >
                <FlipCard
                  ref={flipRef}
                  data={data}
                  template={template}
                  qrValue={qrValue}
                  isProduction={isProduction}
                  width={cardW}
                  inactiveLabel={inactiveLabel}
                  reduceMotion={reduceMotion}
                  onSideChange={setSide}
                />
              </MotiView>
            )}
          </View>

          {!!data && (
            <Reveal index={2} style={styles.fullWidth}>
              <Text style={styles.hint}>
                <MaterialCommunityIcons name="gesture-tap" size={13} color={C.textMuted} /> Tap the card to see the{' '}
                {side === 'front' ? 'back (blood group, emergency contact, QR code)' : 'front'}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => flipRef.current?.flip()}
                  accessibilityRole="button"
                  accessibilityLabel={side === 'front' ? 'Show the back of the card' : 'Show the front of the card'}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
                >
                  <MaterialCommunityIcons name="rotate-3d-variant" size={18} color={C.primary} />
                  <Text style={styles.secondaryText}>{side === 'front' ? 'Show back' : 'Show front'}</Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  accessibilityRole="button"
                  accessibilityLabel="Share my ID card details"
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
                >
                  <MaterialCommunityIcons name="share-variant-outline" size={18} color={C.onPrimary} />
                  <Text style={styles.primaryText}>Share</Text>
                </Pressable>
              </View>
            </Reveal>
          )}

          {!!data && (
            <Reveal index={3} style={styles.fullWidth}>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <MaterialCommunityIcons name="qrcode-scan" size={17} color={C.primary} />
                  </View>
                  <Text style={styles.infoText}>
                    The QR code on the back opens the company’s verification page, so security can confirm the card is
                    yours.
                  </Text>
                </View>
                <View style={[styles.infoRow, styles.infoDivider]}>
                  <View style={styles.infoIcon}>
                    <MaterialCommunityIcons name="account-box-outline" size={17} color={C.primary} />
                  </View>
                  <Text style={styles.infoText}>
                    The photo is the one HR has on file (not the photo you set on this phone). To change it or fix any
                    detail, please contact HR.
                  </Text>
                </View>
              </View>
            </Reveal>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.bgSurfaceLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
    headerSubtitle: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, marginTop: 1 },
    avatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    scroll: { padding: 16, paddingTop: 18, paddingBottom: 40, gap: 16, alignItems: 'center' },
    fullWidth: { width: '100%' },

    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
    brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    titleText: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16.5 },
    titleSub: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12, marginTop: 1 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipDot: { width: 7, height: 7, borderRadius: 3.5 },
    chipText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },

    warn: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      backgroundColor: C.badgeRedBg,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: C.statusRed,
      padding: 12,
    },
    warnText: { flex: 1, color: C.badgeRedText, fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 19 },
    warnStrong: { fontFamily: FontFamily.bodySemibold },

    cardArea: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },

    hint: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12, textAlign: 'center', marginBottom: 12 },
    actions: { flexDirection: 'row', gap: 10 },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.primaryFixed,
      borderRadius: BorderRadius.full,
      paddingVertical: 13,
      minHeight: 48,
    },
    secondaryText: { color: C.primary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: 13,
      minHeight: 48,
    },
    primaryText: { color: C.onPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },

    infoCard: {
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: BorderRadius.lg,
      padding: 14,
    },
    infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    infoDivider: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 12, paddingTop: 12 },
    infoIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoText: { flex: 1, color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, lineHeight: 18 },
  });
