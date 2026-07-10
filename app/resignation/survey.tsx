import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, addDays } from 'date-fns';

import { Input } from '../../src/components/ui/Input';
import { TextArea } from '../../src/components/ui/TextArea';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const SURVEY_QUESTIONS = [
  'What is your primary reason for leaving the company?',
  'Would you recommend this company as a place to work? Why or why not?',
  'Is there anything we could have done differently to retain you?',
];

const minLastDate = addDays(new Date(), 1);

const schema = z.object({
  reason: z.string().min(10, 'Please describe your reason (min 10 characters)').max(500, 'Reason is too long (max 500 characters)'),
  lastWorkingDate: z.string().optional(),
  q1: z.string().max(400, 'Answer is too long (max 400 characters)').optional(),
  q2: z.string().max(400, 'Answer is too long (max 400 characters)').optional(),
  q3: z.string().max(400, 'Answer is too long (max 400 characters)').optional(),
});

type FormData = z.infer<typeof schema>;

function StepBar() {
  return (
    <View style={step.row}>
      <View style={step.active} />
      <View style={step.divider} />
      <View style={step.inactive} />
    </View>
  );
}

const step = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  active: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  divider: { width: 8 },
  inactive: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.outlineVariant },
});

export default function ResignationSurveyScreen() {
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: '',
      lastWorkingDate: undefined,
      q1: '',
      q2: '',
      q3: '',
    },
  });

  const onNext = (data: FormData) => {
    router.push({
      pathname: '/resignation/confirm',
      params: {
        reason: data.reason,
        lastWorkingDate: data.lastWorkingDate,
        q1: data.q1,
        q2: data.q2,
        q3: data.q3,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Resignation Survey</Text>
            <Text style={styles.headerSub}>Step 1 of 2</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>

        <StepBar />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Reason */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.qNum}><Text style={styles.qNumText}>R</Text></View>
              <Text style={styles.sectionTitle}>Primary Reason for Resigning</Text>
            </View>
            <Controller
              control={control}
              name="reason"
              render={({ field: { onChange, value, onBlur } }) => (
                <TextArea
                  placeholder="Briefly describe your main reason for leaving…"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  minLength={10}
                  maxLength={500}
                  error={errors.reason?.message}
                />
              )}
            />
          </View>

          {/* Last working date */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.qNum}><Text style={styles.qNumText}>D</Text></View>
              <Text style={styles.sectionTitle}>Proposed Last Working Date</Text>
            </View>
            <Controller
              control={control}
              name="lastWorkingDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField
                  label=""
                  value={value ?? ''}
                  onChange={onChange}
                  minDate={minLastDate}
                  error={errors.lastWorkingDate?.message}
                />
              )}
            />
          </View>

          {/* Survey questions */}
          {SURVEY_QUESTIONS.map((q, i) => {
            const name = (['q1', 'q2', 'q3'] as const)[i];
            return (
              <View key={i} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.qNum}><Text style={styles.qNumText}>{i + 1}</Text></View>
                  <Text style={styles.sectionTitle}>{q}</Text>
                </View>
                <Controller
                  control={control}
                  name={name}
                  render={({ field: { onChange, value, onBlur } }) => (
                    <TextArea
                      placeholder="Your answer…"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      maxLength={400}
                      error={errors[name]?.message}
                    />
                  )}
                />
              </View>
            );
          })}

          <TouchableOpacity style={styles.nextBtn} onPress={handleSubmit(onNext)} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>Review & Confirm</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  headerSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 40, gap: 12 },

  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  qNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  qNumText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  sectionTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },

  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
