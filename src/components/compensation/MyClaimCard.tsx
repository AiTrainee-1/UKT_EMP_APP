import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { kindTone, statusTone, type StatusTone } from '../../lib/compensation';
import { myClaimDecisionLine, myClaimFacts, myClaimTitle, type MyClaim } from '../../lib/compensationClaims';

/** One of the employee's own claims on "My claims": kind, status, what and when, who raised it, the reason, the decision,
 *  and Withdraw while it waits (only on the employee's own claims, unless the server says otherwise). */
export function MyClaimCard({
  claim,
  onWithdraw,
  withdrawing,
}: {
  claim: MyClaim;
  onWithdraw: (claim: MyClaim) => void;
  withdrawing: boolean;
}) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = kindTone(claim.kind === 'birthday' ? 'birthday_credit' : (claim.kind ?? ''));
  const status = statusColors(Colors, statusTone(claim.status));
  const facts = myClaimFacts(claim);
  const decision = myClaimDecisionLine(claim);
  const title = myClaimTitle(claim);

  return (
    <View
      style={[styles.card, { borderLeftColor: tone.solid }]}
      accessible={!claim.canWithdraw}
      accessibilityLabel={`${title}. ${claim.statusLabel}.${decision ? ` ${decision}` : ''}`}
      testID={`my-claim-${claim.id}`}
    >
      <View style={styles.top}>
        <View style={[styles.kindChip, { backgroundColor: isDark ? tone.softDark : tone.softLight }]}>
          <MaterialCommunityIcons name={tone.icon as any} size={13} color={isDark ? tone.inkDark : tone.inkLight} />
          <Text style={[styles.kindText, { color: isDark ? tone.inkDark : tone.inkLight }]} numberOfLines={1}>
            {claim.kindLabel}
          </Text>
        </View>
        {!!claim.statusLabel && (
          <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.fg }]} numberOfLines={2}>
              {claim.statusLabel}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.title, TabularNums]}>{title}</Text>
      {facts.length > 0 && (
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={`${f.icon}:${f.text}`} style={styles.fact}>
              <MaterialCommunityIcons name={f.icon as any} size={12} color={Colors.textMuted} />
              <Text style={styles.factText}>{f.text}</Text>
            </View>
          ))}
        </View>
      )}
      {!!claim.reason && (
        <Text style={styles.reason} numberOfLines={3}>
          "{claim.reason}"
        </Text>
      )}
      {!!decision && <Text style={styles.decision}>{decision}</Text>}
      {claim.canWithdraw && (
        <TouchableOpacity
          style={[styles.withdraw, withdrawing && styles.busy]}
          onPress={() => onWithdraw(claim)}
          disabled={withdrawing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Withdraw ${title}`}
          accessibilityState={{ disabled: withdrawing, busy: withdrawing }}
          testID={`my-claim-withdraw-${claim.id}`}
        >
          {withdrawing ? (
            <ActivityIndicator size="small" color={Colors.statusRed} />
          ) : (
            <MaterialCommunityIcons name="undo-variant" size={15} color={Colors.statusRed} />
          )}
          <Text style={styles.withdrawText}>Withdraw</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function statusColors(Colors: Palette, tone: StatusTone): { bg: string; fg: string } {
  switch (tone) {
    case 'good':
      return { bg: Colors.badgeGreenBg, fg: Colors.badgeGreenText };
    case 'info':
      return { bg: Colors.badgeBlueBg, fg: Colors.badgeBlueText };
    case 'warn':
      return { bg: Colors.badgeYellowBg, fg: Colors.badgeYellowText };
    case 'bad':
      return { bg: Colors.badgeRedBg, fg: Colors.badgeRedText };
    default:
      return { bg: Colors.badgePendingBg, fg: Colors.badgePendingText };
  }
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      borderLeftWidth: 4,
      padding: 14,
      gap: 8,
      ...(Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }) as object),
    },
    top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 6 },
    kindChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      maxWidth: '100%',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    kindText: { fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
    statusChip: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4, maxWidth: '100%' },
    statusText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14, lineHeight: 20 },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    fact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Colors.bgSurfaceLow,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    factText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '600' },
    reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
    decision: { color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
    withdraw: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: Colors.clayRed,
      backgroundColor: Colors.badgeRedBg,
    },
    withdrawText: { color: Colors.statusRed, fontSize: 13, fontWeight: '800' },
    busy: { opacity: 0.6 },
  });
