import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import { useSubmitResignation } from '../../src/hooks/useResignation';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const SURVEY_LABELS = [
  'Primary reason for leaving',
  'Would you recommend us?',
  'What could we have done differently?',
];

function StepBar() {
  return (
    <View style={step.row}>
      <View style={step.done} />
      <View style={step.divider} />
      <View style={step.active} />
    </View>
  );
}

const step = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  done: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  divider: { width: 8 },
  active: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
});

export default function ResignationConfirmScreen() {
  const params = useLocalSearchParams<{
    reason: string;
    lastWorkingDate: string;
    q1: string;
    q2: string;
    q3: string;
  }>();

  const { mutate, isPending } = useSubmitResignation();

  const formattedDate = params.lastWorkingDate && params.lastWorkingDate !== 'undefined'
    ? format(parseISO(params.lastWorkingDate), 'd MMMM yyyy')
    : 'Not specified';

  const surveyAnswers = [params.q1, params.q2, params.q3];

  const handleSubmit = () => {
    Alert.alert(
      'Submit Resignation',
      'This action is permanent. Once submitted, HR will review your request. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Submit',
          style: 'destructive',
          onPress: () => {
            mutate(
              {
                reason: params.reason,
                last_working_date: params.lastWorkingDate || null,
                survey_q1_answer: params.q1 || undefined,
                survey_q2_answer: params.q2 || undefined,
                survey_q3_answer: params.q3 || undefined,
              },
              {
                onSuccess: () => router.replace('/resignation/success'),
                onError: () =>
                  Alert.alert('Error', 'Failed to submit resignation. Please try again.'),
              }
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Review & Submit</Text>
          <Text style={styles.headerSub}>Step 2 of 2</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <StepBar />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Warning banner */}
        <View style={styles.warnBanner}>
          <MaterialCommunityIcons name="alert-circle" size={18} color={Colors.statusRed} />
          <Text style={styles.warnText}>
            Please review everything carefully. Submissions cannot be undone.
          </Text>
        </View>

        {/* Reason card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: Colors.badgeBlueBg }]}>
              <MaterialCommunityIcons name="text-box-outline" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Primary Reason</Text>
          </View>
          <Text style={styles.cardBody}>{params.reason}</Text>
        </View>

        {/* Last working date card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: Colors.secondaryFixed }]}>
              <MaterialCommunityIcons name="calendar-check" size={18} color={Colors.secondary} />
            </View>
            <Text style={styles.cardTitle}>Last Working Date</Text>
          </View>
          <Text style={[styles.cardBody, styles.dateHighlight]}>{formattedDate}</Text>
        </View>

        {/* Survey answers */}
        {SURVEY_LABELS.map((label, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.qBadge}>
                <Text style={styles.qBadgeText}>{i + 1}</Text>
              </View>
              <Text style={styles.cardTitle}>{label}</Text>
            </View>
            <Text style={styles.cardBody}>{surveyAnswers[i]}</Text>
          </View>
        ))}

        {/* Notice */}
        <View style={styles.noticeChip}>
          <MaterialCommunityIcons name="information-outline" size={15} color={Colors.onSecondaryContainer} />
          <Text style={styles.noticeText}>
            After submission, HR will review your request and contact you. You can track the status from your profile.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[styles.submitBtn, isPending && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isPending}
          activeOpacity={0.85}
        >
          {isPending ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submitBtnText}>Submitting…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="send-check" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Resignation</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <MaterialCommunityIcons name="arrow-left" size={15} color={Colors.primary} />
          <Text style={styles.backLinkText}>Edit Answers</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  headerSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 40, gap: 12 },

  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.badgeRedBg,
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: Colors.statusRed,
  },
  warnText: {
    flex: 1,
    color: Colors.badgeRedText,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
  },
  dateHighlight: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.primary,
  },
  qBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  qBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  noticeChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.secondaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 14,
  },
  noticeText: {
    flex: 1,
    color: Colors.onSecondaryContainer,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.statusRed,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: '#c62828', shadowOffset: { width: 4, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  backLinkText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
});
