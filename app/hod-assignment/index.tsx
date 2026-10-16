import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Share,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useEmployeeHod } from '../../src/hooks/useCompensation';
import { Avatar } from '../../src/components/ui/Avatar';
import { ContactBlockCard } from '../../src/components/support/ContactBlockCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { openContactAction } from '../../src/lib/openContact';
import {
  approvalMark,
  approvalSummary,
  mailUrl,
  resolvePhotoUrl,
  telUrl,
  unassignedMessage,
} from '../../src/lib/hodAssignment';

/**
 * HOD Assignment: who the employee's Department Head is (the ONE head who decides their requests), how to reach them,
 * and which kinds of request that head can approve. For every employee type, staff and production.
 */
export default function HodAssignmentScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { data, isLoading, refetch, isRefetching } = useEmployeeHod();

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} accessibilityRole="header">HOD Assignment</Text>
        <Text style={styles.headerSubtitle}>Your Department Head and what they can approve</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.pad}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={5} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.errorWrap}>
          <EmptyState
            icon="cloud-alert-outline"
            title="Could not load your Department Head"
            subtitle="Check your connection and try again. If it keeps failing, please contact HR."
          />
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => refetch()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const refresh = (
    <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={Colors.primary} colors={[Colors.primary]} />
  );

  // ── nobody to show: not assigned yet, or the employee is a Department Head themselves ──
  if (!data.assigned) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false} refreshControl={refresh}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name={data.isSelf ? 'account-star-outline' : 'account-question-outline'}
                size={32}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {data.isSelf ? 'You are a Department Head' : 'No Department Head assigned'}
            </Text>
            <Text style={styles.emptyText}>{unassignedMessage(data)}</Text>
          </View>
          <ContactBlockCard
            block={data.hrContact}
            title="Contact HR"
            description={data.contactNote}
            style={styles.gap}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const photo = resolvePhotoUrl(data.photoUrl, process.env.EXPO_PUBLIC_API_URL);
  const phoneUrl = telUrl(data.phone);
  const emailUrl = mailUrl(data.email);
  const callHead = () => {
    if (data.phone && phoneUrl) void openContactAction({ kind: 'call', verb: 'Call', value: data.phone, url: phoneUrl });
  };
  const emailHead = () => {
    if (data.email && emailUrl) void openContactAction({ kind: 'email', verb: 'Email', value: data.email, url: emailUrl });
  };
  // There is no clipboard module in the installed app (adding one would need a new APK build), so "copy" is the system share
  // sheet, which has Copy on both Android and iOS. The number itself is selectable text too.
  const shareNumber = () => {
    if (data.phone) Share.share({ message: data.phone }).catch(() => {});
  };

  const summary = approvalSummary(data.approvals);
  const subtitle = [data.designation, data.department].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false} refreshControl={refresh}>
        {/* The card */}
        <View style={styles.card}>
          <View style={styles.personRow}>
            <Avatar
              uri={photo}
              name={data.name}
              size={72}
              borderColor={Colors.border}
              bgColor={Colors.primaryFixed}
              textColor={Colors.primary}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.badge}>
                <MaterialCommunityIcons name="shield-check-outline" size={12} color={Colors.primary} />
                <Text style={styles.badgeText}>Your Department Head</Text>
              </View>
              <Text style={styles.name} numberOfLines={2}>{data.name}</Text>
              {!!subtitle && <Text style={styles.personSub} numberOfLines={2}>{subtitle}</Text>}
            </View>
          </View>

          <View style={styles.rows}>
            {!!data.phone && (
              <View style={styles.detailRow}>
                {/* The number itself is the tap-to-call target; the round buttons repeat it for a bigger target. */}
                <TouchableOpacity
                  style={styles.phoneTap}
                  onPress={callHead}
                  disabled={!phoneUrl}
                  activeOpacity={0.7}
                  accessibilityRole={phoneUrl ? 'button' : 'text'}
                  accessibilityLabel={phoneUrl ? `Call ${data.name} on ${data.phone}` : `Phone ${data.phone}`}
                >
                  <View style={styles.detailIcon}>
                    <MaterialCommunityIcons name="phone-outline" size={17} color={Colors.primary} />
                  </View>
                  <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>Phone{phoneUrl ? ' · tap to call' : ''}</Text>
                    <Text style={[styles.detailValue, TabularNums]}>{data.phone}</Text>
                  </View>
                </TouchableOpacity>
                {!!phoneUrl && (
                  <TouchableOpacity
                    style={[styles.roundBtn, { backgroundColor: Colors.badgeGreenBg }]}
                    onPress={callHead}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${data.name}`}
                  >
                    <MaterialCommunityIcons name="phone" size={18} color={Colors.statusGreen} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.roundBtn, { backgroundColor: Colors.primaryFixed }]}
                  onPress={shareNumber}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy or share the phone number ${data.phone}`}
                >
                  <MaterialCommunityIcons name="share-variant-outline" size={17} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            )}
            {!!data.email && (
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <MaterialCommunityIcons name="email-outline" size={17} color={Colors.primary} />
                </View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue} selectable>{data.email}</Text>
                </View>
                {!!emailUrl && (
                  <TouchableOpacity
                    style={[styles.roundBtn, { backgroundColor: Colors.badgeBlueBg }]}
                    onPress={emailHead}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Email ${data.name} at ${data.email}`}
                  >
                    <MaterialCommunityIcons name="email" size={17} color={Colors.categoryTracking} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {([
              ['Designation', data.designation, 'badge-account-outline'],
              ['Department', data.department, 'account-group-outline'],
              ['Branch', data.branch, 'office-building-outline'],
            ] as const).filter(([, value]) => !!value).map(([label, value, icon]) => (
              <View key={label} style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <MaterialCommunityIcons name={icon} size={17} color={Colors.primary} />
                </View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* What this head can approve */}
        <View style={[styles.card, styles.gap]}>
          <Text style={styles.cardTitle} accessibilityRole="header">What your Department Head can approve</Text>
          {!!summary && <Text style={styles.cardSub}>{summary}</Text>}
          {data.approvals.length === 0 ? (
            <Text style={styles.cardSub}>The list of approvals is not available right now. Contact HR for any question.</Text>
          ) : (
            <View style={styles.approvalList}>
              {data.approvals.map((a, i) => (
                <View
                  key={a.key}
                  style={[styles.approvalRow, i > 0 && styles.approvalRowBorder]}
                  accessible
                  accessibilityLabel={`${a.label}: ${approvalMark(a)}${a.reason ? `. ${a.reason}` : ''}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.approvalLabel}>{a.label}</Text>
                    {!a.canApprove && !!a.reason && <Text style={styles.approvalReason}>{a.reason}</Text>}
                    {!!a.path && <Text style={styles.approvalPath}>{a.path}</Text>}
                  </View>
                  <View style={[styles.mark, a.canApprove ? styles.markYes : styles.markNo]}>
                    <MaterialCommunityIcons
                      name={a.canApprove ? 'check-circle' : 'close-circle'}
                      size={15}
                      color={a.canApprove ? Colors.statusGreen : Colors.statusRed}
                    />
                    <Text style={[styles.markText, { color: a.canApprove ? Colors.badgeGreenText : Colors.badgeRedText }]}>
                      {approvalMark(a)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.noteBox, styles.gap]}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
          <Text style={styles.noteText}>{data.contactNote}</Text>
        </View>
        <ContactBlockCard block={data.hrContact} title="Contact HR" style={styles.gap} />
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

  pad: { padding: 16, paddingBottom: 32 },
  gap: { marginTop: 14 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 20, paddingVertical: 12, minHeight: 44,
  },
  retryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16,
    ...cardShadow,
  },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6,
  },
  badgeText: { color: Colors.primary, fontSize: 10.5, fontWeight: '800' },
  name: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 19, lineHeight: 25 },
  personSub: { color: Colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 18 },

  rows: { marginTop: 14, gap: 4 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, minHeight: 52,
  },
  detailIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  // Stretches to the row's full height (52) so the whole line is a comfortable tap-to-call target.
  phoneTap: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailText: { flex: 1 },
  detailLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: FontFamily.bodySemibold, letterSpacing: 0.2 },
  detailValue: { color: Colors.textPrimary, fontSize: 14, fontFamily: FontFamily.bodySemibold, marginTop: 1 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  cardTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  cardSub: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  approvalList: { marginTop: 8 },
  approvalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  approvalRowBorder: { borderTopWidth: 1, borderTopColor: Colors.outlineVariant },
  approvalLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, lineHeight: 19 },
  approvalReason: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  approvalPath: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  mark: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5,
  },
  markYes: { backgroundColor: Colors.badgeGreenBg },
  markNo: { backgroundColor: Colors.badgeRedBg },
  markText: { fontSize: 11, fontWeight: '800' },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.lg,
    padding: 12,
  },
  noteText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },

  emptyCard: {
    alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 24,
    ...cardShadow,
  },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16, textAlign: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
