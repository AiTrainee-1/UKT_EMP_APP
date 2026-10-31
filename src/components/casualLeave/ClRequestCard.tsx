import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { Badge } from '../ui/Badge';
import { Reveal } from '../Reveal';
import { ApprovalTrail, WaitingChip } from '../approval/ApprovalTrail';
import { deciderFromFields } from '../../lib/approvalsDecider';
import type { CasualLeaveRequest } from '../../hooks/useCasualLeave';
import { PORTION_LONG, longDate, shortDate } from '../../lib/casualLeave';

const PORTION_ICON = { full: 'weather-sunny', first_half: 'weather-sunset-up', second_half: 'weather-sunset-down' } as const;

/** One Casual Leave application: the day, which part of it, where it stands and who decided. */
export function ClRequestCard({ request, index = 0 }: { request: CasualLeaveRequest; index?: number }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const variant = request.status === 'Approved' ? 'approved' : request.status === 'Rejected' ? 'rejected' : 'pending';
  const edge = variant === 'approved' ? Colors.statusGreen : variant === 'rejected' ? Colors.statusRed : Colors.statusYellow;
  const decided = request.status !== 'Pending' && !!request.reviewComment;

  return (
    <Reveal index={index}>
      <View style={[styles.card, { borderLeftColor: edge }]} testID={`cl-request-${request.id}`}>
        <View style={styles.top}>
          <View style={styles.dateWrap}>
            <MaterialCommunityIcons name="calendar-star" size={16} color={Colors.secondary} />
            <Text style={styles.date}>{longDate(request.date)}</Text>
          </View>
          <Badge label={request.status === 'Pending' ? 'Waiting' : request.status} variant={variant} />
        </View>
        <View style={styles.portion}>
          <MaterialCommunityIcons name={PORTION_ICON[request.portion] as any} size={14} color={Colors.primary} />
          <Text style={styles.portionText}>{PORTION_LONG[request.portion]}</Text>
          <Text style={styles.sent}>Sent {shortDate(String(request.createdAt).slice(0, 10))}</Text>
        </View>
        {!!request.reason && (
          <Text style={styles.reason} numberOfLines={3}>
            "{request.reason}"
          </Text>
        )}
        {/* Who decided it: the badge below ("Approved by HR (Meena) · 31 Oct, 10:05 AM"). The comment stays here. */}
        {decided ? <Text style={styles.decided}>Comment: "{request.reviewComment}"</Text> : null}
        <WaitingChip
          approval={request.approval}
          fallback={deciderFromFields({
            status: request.status,
            name: request.reviewedBy,
            role: (request as any).reviewerRole,
            at: request.reviewedAt,
          })}
        />
        <ApprovalTrail approval={request.approval} />
      </View>
    </Reveal>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      padding: 14,
      marginBottom: 10,
      gap: 8,
      borderLeftWidth: 4,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    date: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    portion: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    portionText: { color: Colors.primary, fontSize: 12.5, fontWeight: '700', flex: 1 },
    sent: { color: Colors.textMuted, fontSize: 11 },
    reason: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },
    decided: { color: Colors.textSecondary, fontSize: 12 },
  });
