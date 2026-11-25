import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { AppNotification } from '../../hooks/useAppNotifications';
import type { FocusFrameState } from '../../hooks/useFocusItem';
import type { NotificationKind, NotificationTone } from '../../lib/notificationList';
import { FocusFrame } from '../focus/FocusFrame';
import { Reveal } from '../Reveal';
import { TodoCheck } from './TodoCheck';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/** A kind's tone on the active theme: the icon's tint and colour. */
export function toneColors(C: Palette, tone: NotificationTone): { bg: string; fg: string } {
  switch (tone) {
    case 'green':
      return { bg: C.badgeGreenBg, fg: C.statusGreen };
    case 'yellow':
      return { bg: C.badgeYellowBg, fg: C.statusYellow };
    case 'red':
      return { bg: C.badgeRedBg, fg: C.statusRed };
    case 'neutral':
      return { bg: C.bgSurfaceHigh, fg: C.textSecondary };
    default:
      return { bg: C.badgeBlueBg, fg: C.primary };
  }
}

/** Rows that animate in when the list first draws (the rest are already below the fold). */
const REVEAL_ROWS = 12;

/**
 * One notification as a to-do row (owner 2026-11-25): the round check (tick = mark read), the type icon, the headline,
 * one line of the message, the time and an unread dot. Tapping the row opens it in the detail sheet; nothing in the
 * list navigates. The rows of one day are drawn as one card (`first` / `last`).
 */
export function NotificationRow({
  item,
  kind,
  headline,
  preview,
  time,
  index,
  first,
  last,
  tickDelay,
  onOpen,
  onTick,
  focus,
}: {
  item: AppNotification;
  kind: NotificationKind;
  headline: string;
  preview: string;
  time: string;
  /** Its place in the list (the entrance stagger). */
  index: number;
  first: boolean;
  last: boolean;
  /** "Mark all read" ripples the ticks down the list. */
  tickDelay: number;
  onOpen: () => void;
  onTick: () => void;
  focus: FocusFrameState;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneColors(C, kind.tone);
  const read = item.isRead;

  const row = (
    <FocusFrame {...focus} radius={BorderRadius.lg} testID={`notification-${item.id}`}>
      <View style={[styles.row, first && styles.first, last && styles.last]}>
        <View style={styles.check}>
          <TodoCheck
            checked={read}
            onPress={onTick}
            delay={tickDelay}
            label={`Mark as read: ${headline}`}
            testID={`notification-${item.id}-read`}
          />
        </View>
        <Pressable
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${read ? '' : 'Unread. '}${headline}. ${preview}. ${time}`}
          accessibilityHint="Opens the whole notification"
        >
          <View style={[styles.icon, { backgroundColor: tone.bg }, read && styles.iconRead]}>
            <MaterialCommunityIcons name={kind.icon as any} size={18} color={tone.fg} />
          </View>
          <View style={styles.text}>
            <View style={styles.line}>
              <Text style={[styles.title, read && styles.titleRead]} numberOfLines={1}>
                {headline}
              </Text>
              <Text style={[styles.time, !read && styles.timeUnread]} numberOfLines={1}>
                {time}
              </Text>
            </View>
            <View style={styles.line}>
              <Text style={[styles.preview, read && styles.previewRead]} numberOfLines={1}>
                {preview}
              </Text>
              {!read && <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />}
            </View>
          </View>
        </Pressable>
        {!last && <View style={styles.divider} />}
      </View>
    </FocusFrame>
  );

  return index < REVEAL_ROWS ? <Reveal index={index} offsetY={8}>{row}</Reveal> : row;
}

/** The "Today · 2 new" line above a day's card. */
export function NotificationGroupHeader({ label, count, unread }: { label: string; count: number; unread: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.header} accessibilityRole="header">
      <Text style={styles.headerLabel}>{label}</Text>
      <Text style={[styles.headerCount, unread > 0 && styles.headerCountNew]}>
        {unread > 0 ? `${unread} new` : `${count}`}
      </Text>
    </View>
  );
}

/** A grey row while the list loads. */
export function NotificationRowSkeleton({ first, last }: { first: boolean; last: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, first && styles.first, last && styles.last]}>
      <View style={styles.check}>
        <View style={styles.skelCheck} />
      </View>
      <View style={styles.main}>
        <View style={[styles.icon, styles.skel]} />
        <View style={[styles.text, { gap: 8 }]}>
          <View style={[styles.skel, { width: '55%', height: 11, borderRadius: 6 }]} />
          <View style={[styles.skel, { width: '85%', height: 9, borderRadius: 5 }]} />
        </View>
      </View>
      {!last && <View style={styles.divider} />}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.bgCard,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: C.border,
      paddingLeft: 4,
    },
    first: { borderTopWidth: 1, borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, paddingTop: 2, overflow: 'hidden' },
    last: { borderBottomWidth: 1, borderBottomLeftRadius: BorderRadius.lg, borderBottomRightRadius: BorderRadius.lg, paddingBottom: 2, overflow: 'hidden' },
    check: { width: 44, alignItems: 'center' },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 12,
      paddingRight: 14,
      paddingLeft: 2,
      minHeight: 64,
    },
    pressed: { backgroundColor: C.bgSurfaceLow },
    icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    iconRead: { opacity: 0.55 },
    text: { flex: 1, gap: 3 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { flex: 1, color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    titleRead: { color: C.textMuted, fontFamily: FontFamily.bodyRegular },
    time: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5 },
    timeUnread: { color: C.primary, fontFamily: FontFamily.bodySemibold },
    preview: { flex: 1, color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 12.5 },
    previewRead: { color: C.textMuted },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
    // under the text, from the icon on (a to-do list's hairline)
    divider: { position: 'absolute', left: 50, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.outlineVariant },

    header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 16, paddingBottom: 8 },
    headerLabel: { color: C.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
    headerCount: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12 },
    headerCountNew: { color: C.primary, fontFamily: FontFamily.bodySemibold },

    skel: { backgroundColor: C.bgSurfaceHigh },
    skelCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.outlineVariant },
  });
