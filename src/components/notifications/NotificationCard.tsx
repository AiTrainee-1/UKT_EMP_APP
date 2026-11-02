import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { AppNotification } from '../../hooks/useAppNotifications';
import type { FocusFrameState } from '../../hooks/useFocusItem';
import { isLongMessage, type ViewAction } from '../../lib/notificationTarget';
import { FocusFrame } from '../focus/FocusFrame';
import { Reveal } from '../Reveal';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

export interface NotificationMeta {
  icon: string;
  bg: string;
  color: string;
  title: string;
}

/**
 * One notification (owner, 2026-11-02): its headline, message and time, then two buttons -
 *   Read - marks it read (once read it is a quiet "Read" state, not a button);
 *   View - marks it read and opens the page the notification is about (src/lib/notificationTarget.ts), labelled by the
 *          server ("View leave request", "Open approvals"); left out when there is nothing to open.
 * The card itself no longer navigates: tapping a long message only expands it.
 */
export function NotificationCard({
  item,
  index,
  meta,
  timeText,
  view,
  reading,
  onRead,
  onView,
  focus,
}: {
  item: AppNotification;
  index: number;
  meta: NotificationMeta;
  timeText: string;
  view: ViewAction | null;
  /** The Read request for this notification is on its way. */
  reading: boolean;
  onRead: () => void;
  onView: () => void;
  focus: FocusFrameState;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);

  const title = item.title || meta.title;
  // A notification made from a WhatsApp message has a headline and a longer body: more lines before it folds.
  const lines = item.title ? 6 : 2;
  const expandable = isLongMessage(item.message, lines);
  const label = `${item.isRead ? '' : 'Unread. '}${title}. ${item.message}. ${timeText}`;
  const body = (
    <>
      <Text style={[styles.title, item.isRead && styles.titleRead]}>{title}</Text>
      <Text style={styles.message} numberOfLines={expanded ? undefined : lines}>
        {item.message}
      </Text>
      {expandable && <Text style={styles.more}>{expanded ? 'Show less' : 'Show more'}</Text>}
      <Text style={styles.time}>{timeText}</Text>
    </>
  );

  return (
    <Reveal index={index}>
      <FocusFrame {...focus} testID={`notification-${item.id}`}>
        <View style={[styles.card, { borderLeftColor: meta.color }]}>
          <View style={[styles.top, item.isRead && styles.topRead]}>
            <View style={[styles.icon, { backgroundColor: meta.bg }]}>
              <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
            </View>
            {expandable ? (
              <Pressable
                style={styles.body}
                onPress={() => setExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={label}
                accessibilityHint={expanded ? 'Shows less of the message' : 'Shows the whole message'}
              >
                {body}
              </Pressable>
            ) : (
              <View style={styles.body} accessible accessibilityLabel={label}>
                {body}
              </View>
            )}
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>

          <View style={styles.actions}>
            {item.isRead ? (
              <View style={styles.readState} accessible accessibilityLabel="Read" testID={`notification-${item.id}-read-state`}>
                <MaterialCommunityIcons name="check-all" size={15} color={Colors.textMuted} />
                <Text style={styles.readStateText}>Read</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.readBtn, reading && styles.busy]}
                onPress={onRead}
                disabled={reading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Mark as read: ${title}`}
                accessibilityState={{ disabled: reading, busy: reading }}
                testID={`notification-${item.id}-read`}
              >
                <MaterialCommunityIcons name="check" size={16} color={Colors.primary} />
                <Text style={styles.readBtnText}>{reading ? 'Marking…' : 'Read'}</Text>
              </TouchableOpacity>
            )}
            {view && (
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={onView}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${view.label}: ${title}`}
                accessibilityHint={view.hint}
                testID={`notification-${item.id}-view`}
              >
                <Text style={styles.viewBtnText} numberOfLines={1}>
                  {view.label}
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={Colors.onPrimary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </FocusFrame>
    </Reveal>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderLeftWidth: 3,
      borderColor: Colors.border,
      padding: 14,
      gap: 10,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    // Read ones step back a little; the buttons below keep full contrast.
    topRead: { opacity: 0.75 },
    icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    body: { flex: 1, gap: 3 },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    titleRead: { color: Colors.textSecondary },
    message: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
    more: { color: Colors.primary, fontSize: 12, fontWeight: '700', marginTop: 1 },
    time: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4, flexShrink: 0 },

    // Lined up under the text, past the icon (42 + 12).
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: 54 },
    readBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: Colors.primary,
      backgroundColor: Colors.bgCard,
    },
    readBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '800' },
    busy: { opacity: 0.6 },
    readState: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
    readStateText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '700' },
    viewBtn: {
      minHeight: 44,
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
    },
    viewBtnText: { color: Colors.onPrimary, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  });
