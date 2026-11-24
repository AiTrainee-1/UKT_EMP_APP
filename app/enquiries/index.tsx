import React, { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, isValid, parseISO } from 'date-fns';

import {
  ENQUIRY_CATEGORIES,
  ENQUIRY_STATUS,
  MESSAGE_MAX,
  SUBJECT_MAX,
  enquiryProblem,
  useMyEnquiries,
  useRaiseEnquiry,
  type Enquiry,
} from '../../src/hooks/useEnquiries';
import { useFocusParam } from '../../src/hooks/useFocusItem';
import { isQueued, QUEUED_MESSAGE } from '../../src/offline/submit';
import { QueuedOpsList } from '../../src/components/offline/QueuedOpsList';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { TextArea } from '../../src/components/ui/TextArea';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { Reveal } from '../../src/components/Reveal';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

/**
 * Enquiries (owner 2026-11-24, replaced "Ask HR"): raise a question or concern to HR and follow it - Pending, On Hold,
 * Done - with HR's reply. HR handles them on the HR portal's Enquiries page; every change comes to the phone as a
 * notification, whose View opens the enquiry here (?focus=<id>). Works offline (saved on the phone, sent later).
 */
type Filter = 'all' | 'pending' | 'on_hold' | 'done';

function tone(status: string, C: Palette) {
  if (status === 'done') return { bg: C.badgeGreenBg, fg: C.badgeGreenText, icon: 'check-circle' };
  if (status === 'on_hold') return { bg: C.badgeBlueBg, fg: C.badgeBlueText, icon: 'pause-circle-outline' };
  return { bg: C.badgeYellowBg, fg: C.badgeYellowText, icon: 'clock-outline' };
}

function when(iso: string | null): string {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'd MMM yyyy, h:mm a') : '';
}

function EnquiryCard({ item, index, focused }: { item: Enquiry; index: number; focused: boolean }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = tone(String(item.status), C);
  const [historyOpen, setHistoryOpen] = useState(false);
  const status = ENQUIRY_STATUS[String(item.status)];
  return (
    <Reveal index={index}>
      <View style={[styles.card, focused && { borderColor: C.primary, borderWidth: 2 }]} testID={`enquiry-${item.id}`}>
        <View style={styles.cardTop}>
          <Text style={styles.cardType}>{item.categoryLabel}</Text>
          <View style={[styles.pill, { backgroundColor: t.bg }]}>
            <MaterialCommunityIcons name={t.icon as any} size={12} color={t.fg} />
            <Text style={[styles.pillText, { color: t.fg }]}>{status?.label ?? item.statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.subject}>{item.subject}</Text>
        {!!item.message && <Text style={styles.details}>{item.message}</Text>}
        <Text style={[styles.stateLine, { color: t.fg }]}>{status?.employeeText ?? item.statusLabel}</Text>
        {!!item.hrReply && (
          <View style={styles.answer}>
            <MaterialCommunityIcons name="account-tie-outline" size={15} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.answerBy}>
                HR{item.handledBy ? ` (${item.handledBy})` : ''}
                {item.handledAt ? ` · ${when(item.handledAt)}` : ''}
              </Text>
              <Text style={styles.answerText}>{item.hrReply}</Text>
            </View>
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.sent}>Raised {when(item.createdAt)} · #{item.id}</Text>
          {item.history.length > 0 && (
            <TouchableOpacity onPress={() => setHistoryOpen((v) => !v)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.historyLink}>{historyOpen ? 'Hide updates' : `Updates (${item.history.length})`}</Text>
            </TouchableOpacity>
          )}
        </View>
        {historyOpen && (
          <View style={styles.history}>
            {item.history.map((h, i) => (
              <Text key={i} style={styles.historyRow}>
                <Text style={styles.historyStatus}>{ENQUIRY_STATUS[h.status]?.label ?? h.status}</Text> · {h.by} · {when(h.at)}
                {h.reply ? `\n"${h.reply}"` : ''}
              </Text>
            ))}
          </View>
        )}
      </View>
    </Reveal>
  );
}

export default function EnquiriesScreen() {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const list = useMyEnquiries();
  const raise = useRaiseEnquiry();
  const focusRequest = useFocusParam();
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const positions = useRef<Record<number, number>>({});

  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A notification's View: show that enquiry (all of them on screen, scrolled to it, outlined).
  useEffect(() => {
    if (!focusRequest) return;
    setFilter('all');
    setFocusedId(focusRequest.value);
  }, [focusRequest?.nonce]);
  useEffect(() => {
    if (focusedId == null || !list.data) return;
    const timer = setTimeout(() => {
      const y = positions.current[focusedId];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [focusedId, list.data]);

  const reset = () => {
    setCategory('general');
    setSubject('');
    setMessage('');
    setError(null);
  };

  const send = async () => {
    const problem = enquiryProblem(subject, message);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      const sent = await raise.mutateAsync({ category, subject, message });
      setOpen(false);
      reset();
      setDone(isQueued(sent) ? QUEUED_MESSAGE : 'Your enquiry was sent to HR. You will get a notification when HR updates it.');
    } catch (err: any) {
      const data = err?.response?.data;
      setError(data?.error || data?.message || 'Could not send it. Please try again.');
    }
  };

  const all = list.data ?? [];
  const counts = {
    all: all.length,
    pending: all.filter((e) => e.status === 'pending').length,
    on_hold: all.filter((e) => e.status === 'on_hold').length,
    done: all.filter((e) => e.status === 'done').length,
  };
  const shown = filter === 'all' ? all : all.filter((e) => e.status === filter);
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'on_hold', label: 'On Hold' },
    { key: 'done', label: 'Done' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Enquiries</Text>
          <Text style={styles.headerSubtitle}>Ask HR and track the answer</Text>
        </View>
        <TouchableOpacity onPress={() => setOpen(true)} style={styles.newBtn} accessibilityRole="button" accessibilityLabel="Raise a new enquiry">
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={styles.newText}>New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={C.primary} />}
      >
        <View style={styles.intro}>
          <MaterialCommunityIcons name="information-outline" size={16} color={C.primary} />
          <Text style={styles.introText}>
            Raise any question or concern for HR. You can follow it here: Pending, On Hold or Done, with HR's answer. You
            also get a notification on your phone when HR updates it. For leave, permission or an advance, use their own pages.
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filter, active && styles.filterActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label} {counts[f.key] ? `(${counts[f.key]})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <QueuedOpsList kinds={['enquiry.submit', 'hrTicket.submit']} title="Not sent yet" style={{ marginBottom: 14 }} />

        {list.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : list.isError && !all.length ? (
          <EmptyState icon="cloud-alert-outline" title="Could not load your enquiries" subtitle="Pull down to try again." />
        ) : !shown.length ? (
          <EmptyState
            icon="message-question-outline"
            title={filter === 'all' ? 'No enquiries yet' : 'Nothing here'}
            subtitle={filter === 'all' ? 'Tap New to ask HR something.' : 'Try another filter.'}
          />
        ) : (
          shown.map((e, i) => (
            <View key={e.id} onLayout={(ev) => { positions.current[e.id] = ev.nativeEvent.layout.y; }}>
              <EnquiryCard item={e} index={i} focused={focusedId === e.id} />
            </View>
          ))
        )}
      </ScrollView>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="New enquiry">
        <Text style={styles.fieldLabel}>What is it about?</Text>
        <View style={styles.types}>
          {ENQUIRY_CATEGORIES.map((t) => {
            const active = t.key === category;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setCategory(t.key)}
                style={[styles.typeChip, active && styles.typeChipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <MaterialCommunityIcons name={t.icon as any} size={18} color={active ? C.primary : C.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, active && { color: C.primary }]}>{t.label}</Text>
                  <Text style={styles.typeHint}>{t.hint}</Text>
                </View>
                {active && <MaterialCommunityIcons name="check-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Subject</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          maxLength={SUBJECT_MAX}
          placeholder="e.g. PF amount looks wrong for October"
          placeholderTextColor={C.textMuted}
          style={styles.input}
          accessibilityLabel="Subject"
        />
        <TextArea
          label="Your question / concern"
          value={message}
          onChangeText={setMessage}
          maxLength={MESSAGE_MAX}
          placeholder="Anything that helps HR answer: dates, amounts, what you expected..."
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title="Send to HR" onPress={() => void send()} loading={raise.isPending} style={{ marginTop: 12 }} />
      </BottomSheet>

      <SuccessOverlay
        visible={!!done}
        title={done === QUEUED_MESSAGE ? 'Saved on your phone' : 'Enquiry sent'}
        message={done ?? ''}
        onDone={() => setDone(null)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: C.bgCard, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgSurfaceLow },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
    headerSubtitle: { color: C.textMuted, fontSize: 11.5, marginTop: 1 },
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, minHeight: 36, borderRadius: BorderRadius.full, backgroundColor: C.primary },
    newText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    content: { padding: 16, paddingBottom: 40 },
    intro: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: BorderRadius.lg, backgroundColor: C.primaryFixed, marginBottom: 12 },
    introText: { flex: 1, color: C.textPrimary, fontSize: 12.5, lineHeight: 18 },
    filters: { gap: 8, paddingBottom: 12 },
    filter: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: C.outlineVariant, backgroundColor: C.bgCard },
    filterActive: { backgroundColor: C.primary, borderColor: C.primary },
    filterText: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: C.textSecondary },
    filterTextActive: { color: '#fff' },
    card: { backgroundColor: C.bgCard, borderRadius: BorderRadius.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.outlineVariant },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardType: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
    pillText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },
    subject: { fontFamily: FontFamily.headlineSemibold, fontSize: 15, color: C.textPrimary, marginTop: 6 },
    details: { fontFamily: FontFamily.bodyRegular, fontSize: 13, color: C.textSecondary, marginTop: 4, lineHeight: 19 },
    stateLine: { fontFamily: FontFamily.bodySemibold, fontSize: 12, marginTop: 8 },
    answer: { flexDirection: 'row', gap: 8, marginTop: 10, padding: 10, borderRadius: BorderRadius.md, backgroundColor: C.bgSurfaceLow },
    answerBy: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.primary },
    answerText: { fontFamily: FontFamily.bodyRegular, fontSize: 13, color: C.textPrimary, marginTop: 2, lineHeight: 19 },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    sent: { fontFamily: FontFamily.bodyRegular, fontSize: 11.5, color: C.textMuted },
    historyLink: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.primary },
    history: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.border, gap: 6 },
    historyRow: { fontSize: 12, color: C.textSecondary, lineHeight: 17 },
    historyStatus: { fontFamily: FontFamily.bodySemibold, color: C.textPrimary },
    fieldLabel: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: C.textPrimary, marginTop: 8, marginBottom: 8 },
    types: { gap: 8 },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.outlineVariant, backgroundColor: C.bgCard },
    typeChipActive: { borderColor: C.primary, backgroundColor: C.primaryFixed },
    typeLabel: { fontFamily: FontFamily.bodySemibold, fontSize: 14, color: C.textPrimary },
    typeHint: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted },
    input: {
      minHeight: 48, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.outlineVariant, backgroundColor: C.bgInput,
      paddingHorizontal: 14, fontSize: 15, color: C.textPrimary, marginBottom: 8,
    },
    error: { color: C.badgeRedText, fontFamily: FontFamily.bodySemibold, fontSize: 13, marginTop: 6 },
  });
