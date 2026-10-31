import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { SessionCard } from '../../lib/liveTrackingStatus';
import { TonePill } from './parts';

interface Props {
  card: SessionCard;
  /** Opens the On-Duty Journey (read-only). */
  onOpenJourney: () => void;
}

/** Today's On-Duty: where to, where the request is, when recording started and how it ends. */
export function OnDutyNowCard({ card, onOpenJourney }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="briefcase-variant-outline" size={18} color={C.categoryOnDuty} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>{card.open ? "TODAY'S ON-DUTY" : "TODAY'S ON-DUTY (ENDED)"}</Text>
          <Text style={styles.destination} numberOfLines={2}>{card.destination}</Text>
        </View>
      </View>

      <View style={styles.pills}>
        <TonePill tone={card.approvalTone} text={card.approvalText} />
        {card.liveText && <TonePill tone={card.liveTone} text={card.liveText} pulse={card.liveTone === 'good'} />}
      </View>

      {card.startedText && (
        <View style={styles.line}>
          <MaterialCommunityIcons name="play-circle-outline" size={15} color={C.textMuted} />
          <Text style={[styles.lineText, TabularNums]}>{card.startedText}</Text>
        </View>
      )}
      <View style={styles.line}>
        <MaterialCommunityIcons name={card.open ? 'flag-checkered' : 'stop-circle-outline'} size={15} color={C.textMuted} />
        <Text style={styles.lineText}>{card.endText}</Text>
      </View>

      <TouchableOpacity
        style={styles.link}
        onPress={onOpenJourney}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="View my On-Duty journey"
      >
        <MaterialCommunityIcons name="map-marker-path" size={16} color={C.primary} />
        <Text style={styles.linkText}>View my On-Duty journey</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={C.primary} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.tertiaryContainer, alignItems: 'center', justifyContent: 'center' },
    overline: { color: C.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
    destination: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, marginTop: 1 },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    lineText: { flex: 1, color: C.textSecondary, fontSize: 12.5, lineHeight: 18 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderTopWidth: 1, borderTopColor: C.outlineVariant, paddingTop: 10 },
    linkText: { flex: 1, color: C.primary, fontSize: 13, fontWeight: '800' },
  });
