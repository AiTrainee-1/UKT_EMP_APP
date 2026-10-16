import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '../ui/Card';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useSupportContact } from '../../hooks/useSupportContact';
import { openContactAction } from '../../lib/openContact';
import {
  contactActionAccessibilityLabel,
  contactActions,
  contactFor,
  defaultContactLabel,
  fallbackSentence,
  type ContactAction,
  type ContactActionKind,
  type ContactBlock,
} from '../../lib/supportContact';

interface Props {
  /** The HR contact block a screen's own reply carried (`askHr.contact`, `hrContact`). */
  block: ContactBlock | null | undefined;
  /** Heading; defaults to the label HR gave the contact. */
  title?: string;
  /** A line under the heading saying what to contact HR about. */
  description?: string;
  style?: ViewStyle;
}

const ICON: Record<ContactActionKind, 'phone-outline' | 'whatsapp' | 'email-outline'> = {
  call: 'phone-outline',
  whatsapp: 'whatsapp',
  email: 'email-outline',
};

/**
 * HR's contact details with a tappable Call / WhatsApp / Email row for each way of reaching them that was filled in,
 * for screens whose own reply already carries the HR block (the Compensation and HOD Assignment screens). It looks like
 * SupportContactCard and uses the same helpers (contactActions, openContactAction). When the block has nothing to tap it
 * falls back to the HR contact saved on the phone (Settings -> HR Contact), and when that has nothing either, to a plain
 * sentence with no numbers.
 */
export function ContactBlockCard({ block, title, description, style }: Props) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { contact } = useSupportContact();
  const shown = block?.hasContact ? block : contactFor(contact, 'hr');
  const actions = contactActions(shown);
  const label = shown?.label || defaultContactLabel('hr');

  const tone = (kind: ContactActionKind) =>
    kind === 'call'
      ? { fg: Colors.primary, bg: Colors.primaryFixed }
      : kind === 'whatsapp'
        ? { fg: Colors.statusGreen, bg: Colors.badgeGreenBg }
        : { fg: Colors.categoryTracking, bg: Colors.badgeBlueBg };

  const renderAction = (action: ContactAction) => {
    const { fg, bg } = tone(action.kind);
    const body = (
      <>
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>
          <MaterialCommunityIcons name={ICON[action.kind]} size={18} color={fg} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowVerb}>{action.verb}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{action.value}</Text>
        </View>
        {action.url !== '' && <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.outline} />}
      </>
    );
    return action.url !== '' ? (
      <TouchableOpacity
        key={action.kind}
        style={styles.row}
        onPress={() => openContactAction(action)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={contactActionAccessibilityLabel(action, label)}
      >
        {body}
      </TouchableOpacity>
    ) : (
      <View key={action.kind} style={styles.row}>{body}</View>
    );
  };

  return (
    <Card style={style}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="headset" size={20} color={Colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">{title ?? label}</Text>
          {!!shown?.hours && (
            <View style={styles.hoursRow}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.hours}>{shown.hours}</Text>
            </View>
          )}
        </View>
      </View>

      {!!description && <Text style={styles.description}>{description}</Text>}

      {actions.length > 0 ? (
        <View style={styles.rowWrap}>{actions.map(renderAction)}</View>
      ) : (
        <Text style={styles.fallback}>{fallbackSentence('hr')}</Text>
      )}
    </Card>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  iconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  hours: { color: Colors.textMuted, fontSize: 11.5, flexShrink: 1 },

  description: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  fallback: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 10 },

  rowWrap: { gap: 8, marginTop: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12, paddingVertical: 10,
    minHeight: 48,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowVerb: { color: Colors.textMuted, fontSize: 11, fontFamily: FontFamily.bodySemibold, letterSpacing: 0.2 },
  rowValue: { color: Colors.textPrimary, fontSize: 14, fontFamily: FontFamily.bodySemibold, marginTop: 1 },
});
