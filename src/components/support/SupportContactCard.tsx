import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
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
  type ContactSituation,
} from '../../lib/supportContact';

interface Props {
  /** 'hr': sign-in, password, account and app problems. 'server': the server or system is not working. */
  situation: ContactSituation;
  /** Tighter padding and pill-shaped buttons in a row, for use inside another screen's layout. */
  compact?: boolean;
  /** Heading; defaults to the label HR gave this contact ("HR Department" / "Software Support"). */
  title?: string;
  /** A line under the heading saying when to use this contact. */
  description?: string;
  /** HR's general note. Defaults to on, except in the compact layout. */
  showNote?: boolean;
  style?: ViewStyle;
}

const ICON: Record<ContactActionKind, 'phone-outline' | 'whatsapp' | 'email-outline'> = {
  call: 'phone-outline',
  whatsapp: 'whatsapp',
  email: 'email-outline',
};

/**
 * The HR / software-support contact details HR configured in the HR portal (Settings -> HR Contact),
 * with a tappable Call / WhatsApp / Email button for each way of reaching them that was filled in.
 *
 * Until something has been loaded, and whenever HR has not entered any details, it shows a plain
 * sentence with no numbers instead. It uses the copy saved on the phone, so it works while the
 * server is down - which is exactly when the software-support card is needed.
 */
export function SupportContactCard({ situation, compact = false, title, description, showNote, style }: Props) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { contact } = useSupportContact();
  const block = contactFor(contact, situation);
  const actions = contactActions(block);
  const label = block?.label || defaultContactLabel(situation);
  const noteVisible = (showNote ?? !compact) && !!contact?.configured && contact.note !== '';

  const tone = (kind: ContactActionKind) =>
    kind === 'call'
      ? { fg: Colors.primary, bg: Colors.primaryFixed }
      : kind === 'whatsapp'
        ? { fg: Colors.statusGreen, bg: Colors.badgeGreenBg }
        : { fg: Colors.categoryTracking, bg: Colors.badgeBlueBg };

  const renderAction = (action: ContactAction) => {
    const { fg, bg } = tone(action.kind);
    const tappable = action.url !== '';
    const icon = <MaterialCommunityIcons name={ICON[action.kind]} size={compact ? 15 : 18} color={fg} />;

    if (compact) {
      const body = (
        <>
          {icon}
          <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>{action.value}</Text>
        </>
      );
      return tappable ? (
        <TouchableOpacity
          key={action.kind}
          style={[styles.pill, { backgroundColor: bg }]}
          onPress={() => openContactAction(action)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={contactActionAccessibilityLabel(action, label)}
          testID={`support-${situation}-${action.kind}`}
        >
          {body}
        </TouchableOpacity>
      ) : (
        <View key={action.kind} style={[styles.pill, { backgroundColor: bg }]}>{body}</View>
      );
    }

    const body = (
      <>
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>{icon}</View>
        <View style={styles.rowText}>
          <Text style={styles.rowVerb}>{action.verb}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{action.value}</Text>
        </View>
        {tappable && <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.outline} />}
      </>
    );
    return tappable ? (
      <TouchableOpacity
        key={action.kind}
        style={styles.row}
        onPress={() => openContactAction(action)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={contactActionAccessibilityLabel(action, label)}
        testID={`support-${situation}-${action.kind}`}
      >
        {body}
      </TouchableOpacity>
    ) : (
      <View key={action.kind} style={styles.row}>{body}</View>
    );
  };

  return (
    <Card padding={compact ? 12 : 16} style={style}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
          <MaterialCommunityIcons
            name={situation === 'hr' ? 'headset' : 'lifebuoy'}
            size={compact ? 16 : 20}
            color={Colors.primary}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">{title ?? label}</Text>
          {!!block?.hours && (
            <View style={styles.hoursRow}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.hours}>{block.hours}</Text>
            </View>
          )}
        </View>
        {situation === 'server' && !!block?.usesHrFallback && <Badge label="Same as HR" variant="pending" />}
      </View>

      {!!description && <Text style={styles.description}>{description}</Text>}

      {actions.length > 0 ? (
        <View style={compact ? styles.pillWrap : styles.rowWrap}>{actions.map(renderAction)}</View>
      ) : (
        <Text style={styles.fallback}>{fallbackSentence(situation)}</Text>
      )}

      {noteVisible && (
        <View style={styles.noteRow}>
          <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.noteText}>{contact?.note}</Text>
        </View>
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
  iconWrapCompact: { width: 32, height: 32, borderRadius: 16 },
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
  },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowVerb: { color: Colors.textMuted, fontSize: 11, fontFamily: FontFamily.bodySemibold, letterSpacing: 0.2 },
  rowValue: { color: Colors.textPrimary, fontSize: 14, fontFamily: FontFamily.bodySemibold, marginTop: 1 },

  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 8,
    maxWidth: '100%',
  },
  pillText: { fontSize: 12.5, fontFamily: FontFamily.bodySemibold, flexShrink: 1 },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  noteText: { flex: 1, color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
});
