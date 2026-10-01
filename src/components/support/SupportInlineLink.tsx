import React from 'react';
import { View, Text, TouchableOpacity, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useSupportAction } from '../../hooks/useSupportContact';
import {
  contactActionAccessibilityLabel,
  defaultContactLabel,
  type ContactActionKind,
  type ContactSituation,
} from '../../lib/supportContact';

interface Props {
  situation: ContactSituation;
  /** Plain text before the link, e.g. "Need help? ". */
  prefix?: string;
  /** Replaces "Call HR" / "Email HR" in the link text, e.g. "Contact HR". */
  lead?: string;
  /** Draw a small phone / WhatsApp / email icon before the text. */
  showIcon?: boolean;
  iconColor?: string;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  /** The plain part of the text. */
  textStyle?: StyleProp<TextStyle>;
  /** The link part of the text. */
  accentStyle?: StyleProp<TextStyle>;
}

const ICON: Record<ContactActionKind, 'phone-outline' | 'whatsapp' | 'email-outline'> = {
  call: 'phone-outline',
  whatsapp: 'whatsapp',
  email: 'email-outline',
};

/**
 * One tappable line for a screen that has room for a single contact ("Need help? Call HR 0421 430 0800"):
 * the first way of reaching HR (or software support) that was configured. When nothing has been loaded or
 * configured it is plain, untappable wording with no number. The screen brings its own styles.
 */
export function SupportInlineLink({
  situation,
  prefix,
  lead,
  showIcon,
  iconColor,
  iconSize = 15,
  style,
  textStyle,
  accentStyle,
}: Props) {
  const { block, action, fallback, open } = useSupportAction(situation);

  const who = situation === 'hr' ? 'HR' : 'support';
  const text = action ? `${lead ?? `${action.verb} ${who}`} ${action.value}` : fallback;
  const label = block?.label || defaultContactLabel(situation);

  const content = (
    <>
      {showIcon && (
        <MaterialCommunityIcons name={action ? ICON[action.kind] : 'headset'} size={iconSize} color={iconColor} />
      )}
      <Text style={textStyle}>
        {prefix}
        <Text style={accentStyle}>{text}</Text>
      </Text>
    </>
  );

  if (!action || !action.url) {
    return <View style={style}>{content}</View>;
  }

  return (
    <TouchableOpacity
      style={style}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={contactActionAccessibilityLabel(action, label)}
    >
      {content}
    </TouchableOpacity>
  );
}
