import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { AppNotification } from '../../hooks/useAppNotifications';
import type { ViewAction } from '../../lib/notificationTarget';
import type { NotificationKind } from '../../lib/notificationList';
import { BottomSheet } from '../ui/BottomSheet';
import { toneColors } from './NotificationRow';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * One notification, large and easy to read (owner 2026-11-25): its kind, when it came, the headline and the whole
 * message - and, when it is about something in the app (src/lib/notificationTarget.ts), ONE small text link to open it.
 * The message can be selected and copied. Closes on the X, a tap outside or Back.
 */
export function NotificationDetailSheet({
  item,
  visible,
  kind,
  headline,
  time,
  view,
  onClose,
  onOpenTarget,
}: {
  /** The notification shown; kept by the screen while the sheet fades out. */
  item: AppNotification | null;
  visible: boolean;
  kind: NotificationKind;
  headline: string;
  /** "Today at 3:42 pm". */
  time: string;
  view: ViewAction | null;
  onClose: () => void;
  onOpenTarget: () => void;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneColors(C, kind.tone);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {item && (
        <View testID={`notification-${item.id}-detail`}>
          <View style={styles.top}>
            <View style={[styles.icon, { backgroundColor: tone.bg }]}>
              <MaterialCommunityIcons name={kind.icon as any} size={24} color={tone.fg} />
            </View>
            <View style={styles.topText}>
              <Text style={[styles.kind, { color: tone.fg }]}>{kind.title}</Text>
              <Text style={styles.time}>{time}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialCommunityIcons name="close" size={20} color={C.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.headline} selectable accessibilityRole="header">
            {headline}
          </Text>
          <Text style={styles.message} selectable>
            {item.message}
          </Text>

          <View style={styles.footer}>
            <View style={styles.readNote}>
              <MaterialCommunityIcons name="check-circle" size={15} color={C.statusGreen} />
              <Text style={styles.readText}>Marked as read</Text>
            </View>
            {view && (
              <Pressable
                onPress={onOpenTarget}
                hitSlop={8}
                style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
                accessibilityRole="link"
                accessibilityLabel={view.label}
                accessibilityHint={view.hint}
                testID={`notification-${item.id}-view`}
              >
                <Text style={styles.linkText} numberOfLines={2}>
                  {view.label}
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={C.primary} />
              </Pressable>
            )}
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    topText: { flex: 1, gap: 2 },
    kind: { fontFamily: FontFamily.bodySemibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
    time: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 13 },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgSurfaceLow },
    closePressed: { backgroundColor: C.bgSurfaceHigh },

    headline: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 20, lineHeight: 27, marginBottom: 10 },
    message: { color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 15.5, lineHeight: 24 },

    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap', // a long link ("View attendance for 25 Nov") takes its own line instead of being cut
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 22,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.outlineVariant,
    },
    readNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    readText: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12.5 },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
      minHeight: 40,
      paddingHorizontal: 6,
      borderRadius: BorderRadius.sm,
    },
    linkPressed: { backgroundColor: C.bgSurfaceLow },
    linkText: { color: C.primary, fontFamily: FontFamily.bodySemibold, fontSize: 14, flexShrink: 1 },
  });
