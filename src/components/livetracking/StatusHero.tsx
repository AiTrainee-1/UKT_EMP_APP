import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { Avatar } from '../ui/Avatar';
import { MONITOR_CHIP, SHARE_CHIP } from '../../lib/liveTrackingStatus';
import type { MonitorAnswer, ShareAnswer, Tone } from '../../lib/liveTrackingStatus';
import { LivePulse, TonePill, toneColors } from './parts';

interface Props {
  monitor: MonitorAnswer;
  share: ShareAnswer;
  employee: { name?: string | null; code?: string | null; photoUrl?: string | null; meta?: string | null };
}

const SHARE_ICON: Record<ShareAnswer['state'], string> = {
  live: 'map-marker-radius',
  saved: 'content-save-outline',
  quiet: 'timer-sand',
  retrying: 'refresh',
  blocked: 'map-marker-alert-outline',
  finishing: 'progress-upload',
  off: 'map-marker-off-outline',
  checking: 'radar',
  unknown: 'cellphone',
};

/**
 * The two answers the employee comes here for, at the top: "Is my location being monitored right now?" and "Is it being
 * shared right now?", with the calm live pulse while it is. Read-only: there is no control on it.
 */
export function StatusHero({ monitor, share, employee }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const monitorTone: Tone = monitor.state === 'yes' ? (share.tone === 'bad' ? 'bad' : 'good') : 'neutral';
  const accent = toneColors(share.state === 'off' ? 'neutral' : share.tone, C);
  const showChannels = share.channels.length > 1 || share.channels.some((c) => c.state !== share.state);

  return (
    <View
      style={[styles.card, { borderTopColor: accent.solid }]}
      accessible
      accessibilityLabel={`Monitored right now: ${MONITOR_CHIP[monitor.state]}. Shared right now: ${SHARE_CHIP[share.state]}. ${share.title}. ${share.detail}`}
    >
      <View style={styles.idRow}>
        <Avatar uri={employee.photoUrl ?? undefined} name={employee.name ?? undefined} size={34} borderColor={C.border} />
        <View style={{ flex: 1 }}>
          <Text style={styles.idName} numberOfLines={1}>{employee.name ?? 'You'}</Text>
          {!!(employee.code || employee.meta) && (
            <Text style={styles.idMeta} numberOfLines={1}>
              {[employee.code, employee.meta].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.heroRow}>
        <LivePulse tone={share.state === 'off' ? 'neutral' : share.tone} active={share.pulse} icon={SHARE_ICON[share.state]} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>{share.title}</Text>
          <Text style={styles.detail}>{share.detail}</Text>
        </View>
      </View>

      <View style={styles.answers}>
        <View style={styles.answer}>
          <View style={styles.answerTop}>
            <MaterialCommunityIcons name="radar" size={15} color={C.textMuted} />
            <Text style={styles.answerLabel}>Monitored right now?</Text>
          </View>
          <TonePill tone={monitorTone} text={MONITOR_CHIP[monitor.state]} />
        </View>
        <View style={styles.answer}>
          <View style={styles.answerTop}>
            <MaterialCommunityIcons name="access-point" size={15} color={C.textMuted} />
            <Text style={styles.answerLabel}>Shared right now?</Text>
          </View>
          <TonePill tone={share.state === 'off' ? 'neutral' : share.tone} text={SHARE_CHIP[share.state]} pulse={share.pulse} />
        </View>
      </View>

      <Text style={styles.monitorDetail}>{monitor.detail}</Text>

      {showChannels && (
        <View style={styles.channels}>
          {share.channels.map((c) => {
            const t = toneColors(c.tone, C);
            return (
              <View key={c.source} style={styles.channel}>
                <View style={[styles.channelDot, { backgroundColor: t.solid }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.channelLabel}>{c.label}</Text>
                  <Text style={styles.channelText}>{c.text}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
}) as object;

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.border,
      borderTopWidth: 4,
      padding: 16,
      gap: 14,
      ...cardShadow,
    },
    idRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    idName: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 13.5 },
    idMeta: { color: C.textMuted, fontSize: 11.5, marginTop: 1 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17, lineHeight: 23 },
    detail: { color: C.textSecondary, fontSize: 12.5, lineHeight: 18 },
    answers: { flexDirection: 'row', gap: 10 },
    answer: { flex: 1, gap: 8, backgroundColor: C.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 12 },
    answerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    answerLabel: { color: C.textMuted, fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
    monitorDetail: { color: C.textSecondary, fontSize: 12.5, lineHeight: 18 },
    channels: { gap: 10, borderTopWidth: 1, borderTopColor: C.outlineVariant, paddingTop: 12 },
    channel: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    channelDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    channelLabel: { color: C.textPrimary, fontSize: 12.5, fontWeight: '800' },
    channelText: { color: C.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 1 },
  });
