import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatePresence, MotiView } from 'moti';

import { Reveal } from '../Reveal';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { useRemindApprover, type PendingRequest, type PendingRequests } from '../../hooks/usePendingReminders';
import {
  cooldownText,
  decisionLine,
  moduleIcon,
  remindErrorText,
  remindLabel,
  secondsUntilRemind,
  shortDateTime,
  stepperSteps,
  waitingSince,
  type RecentHrEdit,
  type StepperState,
} from '../../lib/pendingReminders';

/** How long the "Reminder sent" celebration stays before the card shows its countdown. */
const SENT_MS = 2600;

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (active) setReduce(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** The phone's clock, moved on every 20 seconds while the list is on screen (the countdowns read it). */
function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type ToastFn = (message: string, type: 'success' | 'error' | 'info') => void;

/**
 * HOD Assignment -> My Requests: the employee's own requests still waiting for an answer, where each one stands, and a
 * "Remind" button (once a day per request) that tells whoever has to act now: the Department Head on their phone, or HR.
 * The parent screen owns the query (its tab shows the count) and the pull-to-refresh.
 */
export function MyRequestsPanel({
  data,
  isLoading,
  isError,
  fetchedAt,
  onRetry,
  onToast,
}: {
  data: PendingRequests | undefined;
  isLoading: boolean;
  isError: boolean;
  /** When the list arrived (TanStack's dataUpdatedAt): the countdowns count from it. */
  fetchedAt: number;
  onRetry: () => void;
  onToast: ToastFn;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const now = useNow();

  if (isLoading && !data) {
    return (
      <View accessibilityLabel="Loading your requests" accessibilityState={{ busy: true }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.card, i > 0 && styles.gap]}>
            <View style={styles.topRow}>
              <Skeleton width={42} height={42} borderRadius={21} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton height={14} width="55%" />
                <Skeleton height={11} width="35%" />
              </View>
            </View>
            <Skeleton height={12} width="80%" style={{ marginTop: 14 }} />
            <Skeleton height={34} width="100%" borderRadius={10} style={{ marginTop: 14 }} />
            <Skeleton height={44} width="100%" borderRadius={22} style={{ marginTop: 14 }} />
          </View>
        ))}
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="cloud-alert-outline"
          title={isError ? 'Could not load your requests' : 'Your requests are not available'}
          subtitle="Check your connection and try again. If it keeps failing, please contact HR."
        />
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const recent = data.recentHrEdits.length > 0 && (
    <RecentHrEdits edits={data.recentHrEdits} days={data.recentDays} startIndex={data.items.length + 1} />
  );

  if (data.items.length === 0) {
    return (
      <View>
        <View style={styles.center}>
          <EmptyState
            icon="check-decagram-outline"
            title="Nothing waiting"
            subtitle="All your requests have an answer."
          />
        </View>
        {recent}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.intro}>
        <MaterialCommunityIcons name="bell-ring-outline" size={16} color={Colors.primary} />
        <Text style={styles.introText}>
          {data.items.length === 1 ? '1 request is' : `${data.items.length} requests are`} still waiting for an answer.
          If one is taking long, remind the approver: once a day per request.
        </Text>
      </View>
      {data.items.map((item, i) => (
        <Reveal key={item.key} index={i} style={styles.gap}>
          <RequestCard item={item} now={now} fetchedAt={fetchedAt} onToast={onToast} />
        </Reveal>
      ))}
      {recent}
    </View>
  );
}

/** "Raised by HR": a request HR raised for the employee (an attendance change), not one they sent. */
function RaisedByHrChip({ name }: { name: string | null }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.hrChip} accessibilityLabel={name ? `Raised by HR, ${name}` : 'Raised by HR'}>
      <MaterialCommunityIcons name="account-tie-outline" size={12} color={Colors.badgeYellowText} />
      <Text style={styles.hrChipText}>Raised by HR</Text>
    </View>
  );
}

/** What an attendance change would do to the day, HR's reason and who proposed it. */
function ChangeBox({ text, reason, by }: { text: string; reason: string | null; by: string | null }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.changeBox}>
      <View style={styles.changeHead}>
        <MaterialCommunityIcons name="calendar-edit" size={14} color={Colors.primary} />
        <Text style={styles.changeLabel}>CHANGE HR ASKED FOR</Text>
      </View>
      <Text style={[styles.changeText, TabularNums]}>{text}</Text>
      {!!reason && <Text style={styles.changeReason}>HR's reason: {reason}</Text>}
      {!!by && <Text style={styles.changeBy}>Proposed by {by}</Text>}
    </View>
  );
}

/** HR's attendance changes for this employee decided in the last `days` days: what changed, and who decided it. */
function RecentHrEdits({ edits, days, startIndex }: { edits: RecentHrEdit[]; days: number; startIndex: number }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.recentWrap}>
      <Text style={styles.sectionTitle} accessibilityRole="header">Attendance changes by HR</Text>
      <Text style={styles.sectionSub}>Decided in the last {days} days</Text>
      {edits.map((e, i) => {
        const ok = e.status === 'approved';
        return (
          <Reveal key={e.key} index={startIndex + i} style={styles.gapSm}>
            <View style={styles.recentCard}>
              <View style={styles.recentTop}>
                <View style={[styles.recentIcon, { backgroundColor: ok ? Colors.badgeGreenBg : Colors.badgeRedBg }]}>
                  <MaterialCommunityIcons
                    name={ok ? 'check-circle-outline' : 'close-circle-outline'}
                    size={18}
                    color={ok ? Colors.statusGreen : Colors.statusRed}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recentText, TabularNums]}>{e.change?.text || e.summary || e.title}</Text>
                  <Text style={[styles.recentDecision, { color: ok ? Colors.badgeGreenText : Colors.badgeRedText }]}>
                    {decisionLine(e)}
                  </Text>
                </View>
              </View>
              {!!e.reason && <Text style={styles.recentNote}>HR's reason: {e.reason}</Text>}
              {!!e.comment && <Text style={styles.recentNote}>Note: {e.comment}</Text>}
            </View>
          </Reveal>
        );
      })}
    </View>
  );
}

function RequestCard({
  item,
  now,
  fetchedAt,
  onToast,
}: {
  item: PendingRequest;
  now: number;
  fetchedAt: number;
  onToast: ToastFn;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const remind = useRemindApprover();
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    if (sentAt === null) return;
    const id = setTimeout(() => setSentAt(null), SENT_MS);
    return () => clearTimeout(id);
  }, [sentAt]);

  const wait = secondsUntilRemind(item, fetchedAt, now);
  const blocked = !item.canRemind && wait > 0;
  // canRemind false with no wait left: the countdown ran out on this phone; the next refresh opens the button.
  const showButton = !blocked && sentAt === null;

  const onRemind = () => {
    if (remind.isPending) return;
    remind.mutate(item, {
      onSuccess: (result) => {
        setSentAt(Date.now());
        onToast(result.message, 'success');
        AccessibilityInfo.announceForAccessibility?.(result.message);
      },
      onError: (err) => onToast(remindErrorText(err), 'error'),
    });
  };

  const since = waitingSince(item.submittedAt, now);
  const decided = item.trail.filter((t) => t.decision === 'approved');

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.kindIcon}>
          <MaterialCommunityIcons name={moduleIcon(item.module) as any} size={21} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[item.moduleLabel, since].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {item.raisedBy === 'hr' && <RaisedByHrChip name={item.raisedByName} />}
      </View>

      {item.change ? (
        <ChangeBox text={item.change.text} reason={item.reason} by={item.raisedByName} />
      ) : (
        !!item.summary && <Text style={[styles.summary, TabularNums]}>{item.summary}</Text>
      )}

      <View style={styles.stageChip}>
        <MaterialCommunityIcons name="clock-outline" size={13} color={Colors.badgeBlueText} />
        <Text style={styles.stageText}>{item.stage}</Text>
      </View>

      <Stepper item={item} />

      {decided.length > 0 && (
        <View style={styles.trail}>
          {decided.map((t, i) => (
            <Text key={i} style={styles.trailText}>
              <MaterialCommunityIcons name="check" size={12} color={Colors.statusGreen} />{' '}
              Approved by {t.by ? `${t.by} (${t.roleLabel})` : t.roleLabel}
              {t.at ? ` · ${shortDateTime(t.at)}` : ''}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <AnimatePresence exitBeforeEnter>
          {sentAt !== null ? (
            <SentBurst key="sent" name={item.approver.role === 'hod' ? item.approver.name : 'HR'} />
          ) : showButton ? (
            <MotiView
              key="button"
              from={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'timing', duration: 180 }}
            >
              <TouchableOpacity
                style={[styles.remindBtn, remind.isPending && { opacity: 0.75 }]}
                onPress={onRemind}
                disabled={remind.isPending}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${remindLabel(item)} about ${item.title}`}
                accessibilityHint={
                  item.approver.role === 'hod'
                    ? `Sends ${item.approver.name} a notification asking them to review this request`
                    : 'Tells HR this request is still waiting'
                }
                accessibilityState={{ busy: remind.isPending, disabled: remind.isPending }}
              >
                {remind.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="bell-ring-outline" size={17} color="#fff" />
                )}
                <Text style={styles.remindText}>{remind.isPending ? 'Sending reminder…' : remindLabel(item)}</Text>
              </TouchableOpacity>
            </MotiView>
          ) : (
            <MotiView
              key="cooldown"
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'timing', duration: 200 }}
              style={styles.cooldown}
              accessible
              accessibilityLabel={`${cooldownText(wait) || 'Reminder sent'}.${
                item.lastRemindedAt ? ` Last reminded ${shortDateTime(item.lastRemindedAt)}.` : ''
              }`}
            >
              <MaterialCommunityIcons name="timer-sand" size={16} color={Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cooldownText, TabularNums]}>
                  {cooldownText(wait) || 'Reminder sent. Pull down to refresh.'}
                </Text>
                {!!item.lastRemindedAt && (
                  <Text style={styles.cooldownSub}>Last reminded {shortDateTime(item.lastRemindedAt)}</Text>
                )}
              </View>
            </MotiView>
          )}
        </AnimatePresence>
      </View>
    </View>
  );
}

const stepColor = (state: StepperState, Colors: Palette) =>
  state === 'approved' || state === 'submitted' ? Colors.statusGreen
  : state === 'rejected' ? Colors.statusRed
  : state === 'pending' ? Colors.primary
  : Colors.outline;

const stepIcon = (state: StepperState) =>
  state === 'approved' || state === 'submitted' ? 'check'
  : state === 'rejected' ? 'close'
  : state === 'skipped' ? 'skip-next'
  : state === 'pending' ? 'clock-outline'
  : null;

/** You -> Department Head -> HR, the step the request is at now highlighted (a soft pulse unless Reduce Motion is on). */
function Stepper({ item }: { item: PendingRequest }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const steps = stepperSteps(item);

  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={`Approval path: ${steps
        .map((s) => `${s.label}${s.current ? ' (now)' : s.state === 'approved' ? ' (approved)' : ''}`)
        .join(', then ')}`}
    >
      {steps.map((s, i) => {
        const color = stepColor(s.state, Colors);
        const icon = stepIcon(s.state);
        const filled = s.state === 'approved' || s.state === 'submitted' || s.current;
        return (
          <React.Fragment key={`${s.label}-${i}`}>
            {i > 0 && (
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor:
                      steps[i - 1].state === 'approved' || steps[i - 1].state === 'submitted'
                        ? Colors.statusGreen
                        : Colors.outlineVariant,
                  },
                ]}
              />
            )}
            <View style={styles.stepItem}>
              <View style={styles.dotWrap}>
                {s.current && !reduce && (
                  <MotiView
                    from={{ opacity: 0.45, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.7 }}
                    transition={{ type: 'timing', duration: 1500, loop: true, repeatReverse: false }}
                    style={[styles.pulse, { backgroundColor: color }]}
                  />
                )}
                <View
                  style={[
                    styles.dot,
                    { borderColor: color, backgroundColor: filled ? color : Colors.bgCard },
                  ]}
                >
                  {!!icon && (
                    <MaterialCommunityIcons name={icon as any} size={12} color={filled ? '#fff' : color} />
                  )}
                </View>
              </View>
              <Text
                style={[styles.stepLabel, s.current && { color: Colors.primary, fontFamily: FontFamily.bodySemibold }]}
                numberOfLines={2}
              >
                {s.label}
              </Text>
              {s.current && <Text style={styles.stepNow}>Now</Text>}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** The "it went" moment: a check pops in, a ring spreads out, and the line says who was reminded. */
function SentBurst({ name }: { name: string }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();

  return (
    <MotiView
      from={{ opacity: 0, translateY: reduce ? 0 : 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={styles.sent}
    >
      <View style={styles.sentIconWrap}>
        {!reduce && (
          <MotiView
            from={{ opacity: 0.5, scale: 0.6 }}
            animate={{ opacity: 0, scale: 2.1 }}
            transition={{ type: 'timing', duration: 900 }}
            style={[styles.sentRing, { borderColor: Colors.statusGreen }]}
          />
        )}
        <MotiView
          from={reduce ? { scale: 1 } : { scale: 0.3, rotate: '-25deg' }}
          animate={{ scale: 1, rotate: '0deg' }}
          transition={reduce ? { type: 'timing', duration: 0 } : { type: 'spring', damping: 9, stiffness: 180 }}
          style={styles.sentIcon}
        >
          <MaterialCommunityIcons name="send-check" size={18} color="#fff" />
        </MotiView>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sentTitle}>Reminder sent</Text>
        <Text style={styles.sentSub} numberOfLines={1}>{name} has been asked to review it</Text>
      </View>
    </MotiView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  gap: { marginTop: 12 },
  center: { alignItems: 'center', paddingTop: 12 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 20, paddingVertical: 12, minHeight: 44,
  },
  retryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },

  intro: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.lg, padding: 12,
  },
  introText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
    ...cardShadow,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kindIcon: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, lineHeight: 20 },
  meta: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  summary: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 10 },

  hrChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  hrChipText: { color: Colors.badgeYellowText, fontSize: 10.5, fontWeight: '800' },
  changeBox: {
    marginTop: 10, padding: 12, gap: 3,
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  changeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeLabel: { color: Colors.primary, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  changeText: { color: Colors.textPrimary, fontSize: 13.5, lineHeight: 19, fontFamily: FontFamily.bodySemibold, marginTop: 2 },
  changeReason: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  changeBy: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },

  gapSm: { marginTop: 8 },
  recentWrap: { marginTop: 22 },
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  sectionSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  recentCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  recentTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recentIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  recentText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 18, fontFamily: FontFamily.bodySemibold },
  recentDecision: { fontSize: 11.5, marginTop: 3, fontFamily: FontFamily.bodySemibold },
  recentNote: { color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 6 },

  stageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 10, maxWidth: '100%',
  },
  stageText: { color: Colors.badgeBlueText, fontSize: 11.5, fontFamily: FontFamily.bodySemibold, flexShrink: 1 },

  stepper: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: 14,
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md,
    paddingVertical: 12, paddingHorizontal: 8,
  },
  stepItem: { alignItems: 'center', width: 84 },
  stepLine: { flex: 1, height: 2, borderRadius: 1, marginTop: 11 },
  dotWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 24, height: 24, borderRadius: 12 },
  dot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { color: Colors.textSecondary, fontSize: 11, lineHeight: 14, marginTop: 6, textAlign: 'center' },
  stepNow: { color: Colors.primary, fontSize: 10, fontWeight: '800', marginTop: 2, letterSpacing: 0.4 },

  trail: { marginTop: 10, gap: 3 },
  trailText: { color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16 },

  footer: { marginTop: 14, minHeight: 46, justifyContent: 'center' },
  remindBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 18, minHeight: 46,
  },
  remindText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  cooldown: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 10, minHeight: 46,
  },
  cooldownText: { color: Colors.textPrimary, fontSize: 12.5, fontFamily: FontFamily.bodySemibold },
  cooldownSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  sent: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 46,
  },
  sentIconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  sentRing: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2 },
  sentIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.statusGreen,
    alignItems: 'center', justifyContent: 'center',
  },
  sentTitle: { color: Colors.badgeGreenText, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  sentSub: { color: Colors.badgeGreenText, fontSize: 11.5, marginTop: 1, opacity: 0.85 },
});
