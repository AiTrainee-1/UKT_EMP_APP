import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { discardQueuedOp, retryQueuedOp, useOfflineStatus } from '../../offline/engine';
import { savedAgo, useQueuedOps } from '../../offline/useQueuedOps';
import type { OpKind, QueuedOp } from '../../offline/types';
import { useNetworkBanner } from '../../lib/networkStatus';
import { isOnline } from '../../lib/networkBanner';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * What is still on the phone, waiting to be sent (src/offline): one card per operation with its state ("Waiting to
 * sync" / "Could not be sent" + the server's words) and the two things the employee can do - send it again now, or
 * throw it away (with a question first: it is the only way unsent data leaves the phone besides the server taking it).
 *
 * `kinds` limits it to one screen's operations (the Leave page shows its queued leave requests). Nothing renders when
 * nothing waits.
 */
export function QueuedOpsList({
  kinds,
  title = 'Saved on your phone',
  style,
  emptyText,
}: {
  kinds?: OpKind[];
  title?: string | null;
  style?: StyleProp<ViewStyle>;
  /** When set, shown when nothing waits (the Sync page); otherwise the list renders nothing. */
  emptyText?: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ops = useQueuedOps(kinds);
  const { syncing } = useOfflineStatus();
  const online = isOnline(useNetworkBanner());

  if (!ops.length) {
    return emptyText ? (
      <View style={[styles.empty, style]}>
        <MaterialCommunityIcons name="cloud-check-outline" size={28} color={Colors.statusGreen} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    ) : null;
  }

  const confirmDiscard = (op: QueuedOp) =>
    Alert.alert(
      'Delete this from your phone?',
      `"${op.label}" has not reached the server. If you delete it, it will never be sent and you would have to do it again.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void discardQueuedOp(op.id) },
      ],
    );

  return (
    <View style={[styles.wrap, style]} accessibilityLabel={`${ops.length} item(s) waiting to be sent`}>
      {!!title && (
        <View style={styles.header}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={16} color={Colors.statusOrange} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.count}>{ops.length}</Text>
        </View>
      )}
      {ops.map((op) => {
        const failed = op.status === 'failed';
        return (
          <View key={op.id} style={[styles.card, failed && styles.cardFailed]}>
            <View style={[styles.iconWell, { backgroundColor: failed ? Colors.badgeRedBg : Colors.badgeYellowBg }]}>
              <MaterialCommunityIcons
                name={failed ? 'alert-circle-outline' : syncing ? 'sync' : 'clock-outline'}
                size={18}
                color={failed ? Colors.badgeRedText : Colors.badgeYellowText}
              />
            </View>
            <View style={styles.body}>
              <Text style={styles.label} numberOfLines={2}>{op.label}</Text>
              <Text style={[styles.state, failed && { color: Colors.badgeRedText }]}>
                {failed
                  ? 'Could not be sent'
                  : online
                    ? syncing
                      ? 'Sending now...'
                      : 'Waiting to sync'
                    : 'Waiting for internet'}
                {' · saved '}
                {savedAgo(op.createdAt)}
              </Text>
              {failed && !!op.lastError && <Text style={styles.error}>{op.lastError}</Text>}
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => void retryQueuedOp(op.id)}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${op.label} again now`}
                >
                  <MaterialCommunityIcons name="refresh" size={14} color={Colors.primary} />
                  <Text style={styles.actionText}>{failed ? 'Try again' : 'Send now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDiscard(op)}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${op.label} from this phone`}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color={Colors.badgeRedText} />
                  <Text style={[styles.actionText, { color: Colors.badgeRedText }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    title: { flex: 1, fontFamily: FontFamily.headlineSemibold, fontSize: 13.5, color: Colors.textPrimary },
    count: {
      minWidth: 22,
      textAlign: 'center',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.badgeYellowBg,
      color: Colors.badgeYellowText,
      fontFamily: FontFamily.bodySemibold,
      fontSize: 12,
      overflow: 'hidden',
    },
    card: {
      flexDirection: 'row',
      gap: 10,
      padding: 12,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.bgCard,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: Colors.outlineVariant,
    },
    cardFailed: { borderStyle: 'solid', borderColor: Colors.badgeRedText },
    iconWell: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: 2 },
    label: { fontFamily: FontFamily.bodySemibold, fontSize: 14, color: Colors.textPrimary },
    state: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: Colors.textSecondary },
    error: { fontFamily: FontFamily.bodyRegular, fontSize: 12.5, color: Colors.badgeRedText, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 16, marginTop: 6 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
    actionText: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: Colors.primary },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
    emptyText: { fontFamily: FontFamily.bodyRegular, fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center' },
  });
