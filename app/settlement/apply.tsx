import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MotiView } from 'moti';

import { useAdvanceEligibility, useApplyAdvance, type AdvanceEligibility } from '../../src/hooks/useAdvances';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { FormScrollView } from '../../src/components/FormScrollView';
import { TextArea } from '../../src/components/ui/TextArea';
import { Button } from '../../src/components/ui/Button';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { Reveal } from '../../src/components/Reveal';
import { ErrorBox, RingMeter, TypeIcon, useReduceMotionPref } from '../../src/components/settlement/parts';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, ClayElevation } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import {
  MAX_PURPOSE,
  amountOf,
  applyErrorMessage,
  formatAmountInput,
  limitMeter,
  monthLabel,
  planSummary,
  purposeProblem,
  rupees,
  salaryAdvanceProblem,
  termAmountProblem,
  termEmi,
  termPlan,
  type AdvanceType,
} from '../../src/lib/settlement';

/** The two application forms, Salary Advance and Term Loan, with a live preview of what will be deducted. */
export default function ApplyAdvanceScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const params = useLocalSearchParams<{ type?: string }>();
  const [kind, setKind] = useState<AdvanceType>(params.type === 'term' ? 'term' : 'general');
  const eligibility = useAdvanceEligibility();
  const apply = useApplyAdvance();

  const [amountText, setAmountText] = useState('');
  const [months, setMonths] = useState(6);
  const [purpose, setPurpose] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const data = eligibility.data;
  const switchKind = (k: AdvanceType) => {
    setKind(k);
    setServerError(null);
    setShowErrors(false);
  };

  const amount = amountOf(amountText);
  const amountError = data
    ? kind === 'general'
      ? salaryAdvanceProblem(amountText, data.salaryAdvance.limit, data.monthlySalary)
      : termAmountProblem(amountText, data.termLoan.minAmount, data.termLoan.maxAmount)
    : null;
  const purposeError = purposeProblem(purpose);
  const section = data ? (kind === 'general' ? data.salaryAdvance : data.termLoan) : null;
  const canApply = !!section?.canApply;

  const submit = () => {
    setShowErrors(true);
    setServerError(null);
    if (!data || !canApply || amountError || purposeError) return;
    const what =
      kind === 'general'
        ? `${rupees(amount)} Salary Advance, deducted in full from your ${data.salaryAdvance.deductionLabel} salary.`
        : `${rupees(amount)} Term Loan over ${months} month${months === 1 ? '' : 's'}: ${planSummary(
            termPlan(amount, months, data.termLoan.firstDeductionMonth, data.termLoan.firstDeductionYear),
          )}.`;
    Alert.alert('Send to HR?', `${what}\n\nHR may approve a smaller amount or change the month deductions start.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          try {
            const created = await apply.mutateAsync({
              advanceType: kind,
              amount,
              repaymentMonths: kind === 'term' ? months : undefined,
              purpose: purpose.trim(),
            });
            setCreatedId(created?.id ?? -1);
          } catch (err) {
            setServerError(applyErrorMessage(err));
            void eligibility.refetch();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{kind === 'general' ? 'Salary Advance' : 'Term Loan'}</Text>
          <Text style={styles.headerSubtitle}>Application to HR</Text>
        </View>
      </View>

      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.segment} accessibilityRole="tablist">
            {(['general', 'term'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.segmentBtn, kind === k && styles.segmentBtnActive]}
                onPress={() => switchKind(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === k }}
              >
                <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>
                  {k === 'general' ? 'Salary Advance' : 'Term Loan'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {eligibility.isLoading ? (
            <View style={{ gap: 12 }}>
              <Skeleton height={86} borderRadius={16} />
              <Skeleton height={140} borderRadius={16} />
              <Skeleton height={110} borderRadius={16} />
            </View>
          ) : eligibility.isError || !data ? (
            <ErrorBox text="Could not load the application rules." onRetry={() => void eligibility.refetch()} />
          ) : (
            <>
              {!canApply && section?.reason && (
                <Reveal index={0}>
                  <View style={styles.blocked}>
                    <MaterialCommunityIcons name="lock-clock" size={18} color={Colors.badgeYellowText} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.blockedTitle}>You cannot send this application right now</Text>
                      <Text style={styles.blockedText}>{section.reason}</Text>
                      {data.window.isOpen === false && (
                        <Text style={styles.blockedText}>You can still work out the amount below.</Text>
                      )}
                    </View>
                  </View>
                </Reveal>
              )}

              {kind === 'general' ? (
                <SalaryAdvanceFields data={data} amountText={amountText} setAmountText={setAmountText} />
              ) : (
                <TermLoanFields
                  data={data}
                  amountText={amountText}
                  setAmountText={setAmountText}
                  months={months}
                  setMonths={setMonths}
                />
              )}

              {showErrors && amountError && (
                <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                  {amountError}
                </Text>
              )}

              <Reveal index={3}>
                <TextArea
                  label="What is the money for?"
                  placeholder="e.g. School fees, medical bill, house repair"
                  value={purpose}
                  onChangeText={setPurpose}
                  maxLength={MAX_PURPOSE}
                  minHeight={80}
                  error={showErrors && purposeError ? purposeError : undefined}
                />
              </Reveal>

              <Reveal index={4}>
                <View style={styles.next}>
                  <Text style={styles.nextTitle}>What happens next</Text>
                  {[
                    'HR reviews your application on the Settlement page.',
                    'HR may approve a smaller amount or change the month deductions start. You will see both amounts.',
                    'You get a notification when HR decides. Track it any time under My applications.',
                  ].map((line) => (
                    <View key={line} style={styles.nextRow}>
                      <MaterialCommunityIcons name="check-circle-outline" size={14} color={Colors.primaryLight} />
                      <Text style={styles.nextText}>{line}</Text>
                    </View>
                  ))}
                  {!!data.approvalPath && <Text style={styles.path}>{data.approvalPath}</Text>}
                </View>
              </Reveal>

              {serverError && (
                <View style={styles.serverError} accessibilityLiveRegion="polite">
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.badgeRedText} />
                  <Text style={styles.serverErrorText}>{serverError}</Text>
                </View>
              )}

              <Button
                title={canApply ? 'Send to HR' : 'Not open right now'}
                onPress={submit}
                loading={apply.isPending}
                disabled={!canApply || apply.isPending}
                icon={<MaterialCommunityIcons name="send" size={16} color={canApply ? Colors.onPrimary : Colors.textMuted} />}
              />
            </>
          )}
        </FormScrollView>
      </KeyboardAvoider>

      <SuccessOverlay
        visible={createdId !== null}
        title="Sent to HR"
        message="Your application is waiting for HR approval."
        onDone={() => {
          const id = createdId;
          setCreatedId(null);
          if (id && id > 0) router.replace({ pathname: '/settlement/[id]', params: { id: String(id) } });
          else router.back();
        }}
      />
    </SafeAreaView>
  );
}

// ─── Salary Advance ─────────────────────────────────────────────────────────────────────────────────────────────

function SalaryAdvanceFields({
  data,
  amountText,
  setAmountText,
}: {
  data: AdvanceEligibility;
  amountText: string;
  setAmountText: (t: string) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sa = data.salaryAdvance;
  const amount = amountOf(amountText);
  const meter = limitMeter(amount, sa.limit);
  const tone =
    meter.state === 'over' ? Colors.statusRed : meter.state === 'near' ? Colors.statusYellow : Colors.statusGreen;

  return (
    <>
      <Reveal index={1}>
        <View style={styles.card}>
          <View style={styles.salaryRow}>
            <TypeIcon type="general" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Your monthly salary</Text>
              <Text style={[styles.cardValue, TabularNums]}>
                {data.monthlySalary != null ? rupees(data.monthlySalary) : 'Not recorded'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardLabel}>{sa.percent}% limit</Text>
              <Text style={[styles.cardValue, TabularNums, { color: Colors.primaryLight }]}>
                {sa.limit != null ? rupees(sa.limit) : '-'}
              </Text>
            </View>
          </View>

          <AmountBox value={amountText} onChange={setAmountText} invalid={meter.state === 'over'} />

          {sa.limit != null && (
            <View style={styles.meterRow}>
              <RingMeter ratio={meter.ratio} color={tone} size={84} stroke={9}>
                <Text style={[styles.meterPct, TabularNums, { color: tone }]}>
                  {Number.isFinite(amount) && sa.limit ? Math.round((amount / sa.limit) * 100) : 0}%
                </Text>
                <Text style={styles.meterSmall}>of limit</Text>
              </RingMeter>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.meterHead, { color: tone }]}>
                  {meter.state === 'over'
                    ? `${rupees(amount - sa.limit)} over the limit`
                    : meter.state === 'empty'
                      ? `You can ask for up to ${rupees(sa.limit)}`
                      : `${rupees(meter.left)} left of your limit`}
                </Text>
                <Text style={styles.meterText}>
                  The limit is {sa.percent}% of your monthly fixed salary. Whole rupees only.
                </Text>
              </View>
            </View>
          )}
        </View>
      </Reveal>

      <Reveal index={2}>
        <View style={styles.deduction}>
          <MaterialCommunityIcons name="calendar-arrow-left" size={18} color={Colors.primaryLight} />
          <Text style={styles.deductionText}>
            Deducted in full from your <Text style={styles.bold}>{sa.deductionLabel}</Text> salary
            {Number.isFinite(amount) && amount > 0 ? `: ${rupees(amount)}` : ''}.
          </Text>
        </View>
      </Reveal>
    </>
  );
}

// ─── Term Loan ──────────────────────────────────────────────────────────────────────────────────────────────────

function TermLoanFields({
  data,
  amountText,
  setAmountText,
  months,
  setMonths,
}: {
  data: AdvanceEligibility;
  amountText: string;
  setAmountText: (t: string) => void;
  months: number;
  setMonths: (n: number) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotionPref();
  const tl = data.termLoan;
  const amount = amountOf(amountText);
  const valid = Number.isFinite(amount) && amount >= tl.minAmount;
  const plan = useMemo(
    () => (valid ? termPlan(amount, months, tl.firstDeductionMonth, tl.firstDeductionYear) : []),
    [valid, amount, months, tl.firstDeductionMonth, tl.firstDeductionYear],
  );
  const emi = valid ? termEmi(amount, months) : 0;
  const options = Array.from({ length: tl.maxMonths - tl.minMonths + 1 }, (_, i) => tl.minMonths + i);
  const tallest = Math.max(1, ...plan.map((p) => p.amount));

  return (
    <>
      <Reveal index={1}>
        <View style={styles.card}>
          <View style={styles.salaryRow}>
            <TypeIcon type="term" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Loan amount</Text>
              <Text style={styles.cardHint}>From {rupees(tl.minAmount)}. Whole rupees only.</Text>
            </View>
          </View>
          <AmountBox value={amountText} onChange={setAmountText} />

          <Text style={[styles.cardLabel, { marginTop: 4 }]}>Repay in</Text>
          <View style={styles.monthsGrid} accessibilityRole="radiogroup">
            {options.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.monthChip, months === n && styles.monthChipActive]}
                onPress={() => setMonths(n)}
                accessibilityRole="radio"
                accessibilityState={{ selected: months === n }}
                accessibilityLabel={`${n} month${n === 1 ? '' : 's'}`}
              >
                <Text style={[styles.monthChipNum, months === n && styles.monthChipTextActive]}>{n}</Text>
                <Text style={[styles.monthChipUnit, months === n && styles.monthChipTextActive]}>
                  {n === 1 ? 'month' : 'months'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Reveal>

      <Reveal index={2}>
        <View style={[styles.card, styles.emiCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={styles.cardLabel}>Monthly EMI</Text>
              <Text style={[styles.emiValue, TabularNums]}>{emi ? rupees(emi) : '₹ -'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardLabel}>First EMI</Text>
              <Text style={styles.emiStart}>{monthLabel(tl.firstDeductionMonth, tl.firstDeductionYear)}</Text>
            </View>
          </View>
          {plan.length > 0 ? (
            <>
              <Text style={styles.meterText}>{planSummary(plan)}.</Text>
              <View style={styles.chart} accessibilityLabel={`Schedule: ${planSummary(plan)}`}>
                {plan.map((p, i) => (
                  <View key={`${p.year}-${p.month}`} style={styles.chartCol}>
                    <MotiView
                      from={reduce ? undefined : { height: 0 }}
                      animate={{ height: 12 + (p.amount / tallest) * 52 }}
                      transition={{ type: 'timing', duration: reduce ? 0 : 320, delay: reduce ? 0 : i * 25 }}
                      style={[
                        styles.chartBar,
                        { backgroundColor: i === plan.length - 1 && p.amount !== plan[0].amount ? Colors.secondary : Colors.primaryLight },
                      ]}
                    />
                    <Text style={styles.chartLabel}>{p.label.slice(0, 3)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.scheduleList}>
                {plan.map((p) => (
                  <View key={`row-${p.year}-${p.month}`} style={styles.scheduleRow}>
                    <Text style={styles.scheduleMonth}>{monthLabel(p.month, p.year)} salary</Text>
                    <Text style={[styles.scheduleAmt, TabularNums]}>{rupees(p.amount)}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.meterText}>Enter an amount to see your EMI and the months it is deducted.</Text>
          )}
          {tl.activeCount > 0 && (
            <Text style={[styles.meterText, { color: Colors.badgeYellowText }]}>
              You already have {tl.activeCount} Term Loan{tl.activeCount === 1 ? '' : 's'} being repaid. HR will see it
              when deciding.
            </Text>
          )}
        </View>
      </Reveal>
    </>
  );
}

// ─── The amount box: ₹ and digits grouped the Indian way as you type ─────────────────────────────────────────────

function AmountBox({ value, onChange, invalid }: { value: string; onChange: (t: string) => void; invalid?: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.amountBox, focused && styles.amountBoxFocused, invalid && styles.amountBoxInvalid]}>
      <Text style={styles.rupee}>₹</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(formatAmountInput(t))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={Colors.outline}
        style={[styles.amountInput, TabularNums]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={Colors.primary}
        cursorColor={Colors.primary}
        maxLength={12}
        accessibilityLabel="Amount in rupees"
      />
    </View>
  );
}

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
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  bold: { fontFamily: FontFamily.bodySemibold, color: Colors.textPrimary },

  segment: {
    flexDirection: 'row', backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.lg, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: BorderRadius.md, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: Colors.bgCard, ...ClayElevation.low },
  segmentText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  segmentTextActive: { color: Colors.primary },

  blocked: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  blockedTitle: { color: Colors.badgeYellowText, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  blockedText: { color: Colors.badgeYellowText, fontSize: 12, lineHeight: 17 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
    ...ClayElevation.low,
  },
  salaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  cardHint: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  cardValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18, marginTop: 1 },

  amountBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.bgInput, paddingHorizontal: 14, paddingVertical: 6,
  },
  amountBoxFocused: { borderColor: Colors.primaryLight },
  amountBoxInvalid: { borderColor: Colors.statusRed },
  rupee: { color: Colors.textMuted, fontFamily: FontFamily.displayBold, fontSize: 26 },
  amountInput: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 28, paddingVertical: 6 },

  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  meterPct: { fontFamily: FontFamily.displayBold, fontSize: 18 },
  meterSmall: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '700' },
  meterHead: { fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  meterText: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },

  deduction: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  deductionText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },

  monthsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: {
    width: '14.6%', minWidth: 44, alignItems: 'center', paddingVertical: 7,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgSurfaceLow,
  },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthChipNum: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  monthChipUnit: { color: Colors.textMuted, fontSize: 9 },
  monthChipTextActive: { color: Colors.onPrimary },

  emiCard: { gap: 10 },
  emiValue: { color: Colors.primary, fontFamily: FontFamily.displayBold, fontSize: 28 },
  emiStart: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 84, paddingTop: 4 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  chartBar: { width: '70%', maxWidth: 22, borderRadius: 4 },
  chartLabel: { color: Colors.textMuted, fontSize: 9 },
  scheduleList: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  scheduleMonth: { color: Colors.textSecondary, fontSize: 13 },
  scheduleAmt: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },

  fieldError: { color: Colors.statusRed, fontSize: 12.5, fontWeight: '600', marginTop: -6 },

  next: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.lg, padding: 12, gap: 6 },
  nextTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  nextRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  nextText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  path: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  serverError: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.badgeRedBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  serverErrorText: { flex: 1, color: Colors.badgeRedText, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
});
