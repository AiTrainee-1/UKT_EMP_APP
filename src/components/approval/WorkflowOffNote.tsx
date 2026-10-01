import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { workflowOffNote, type ApprovalSummaryItem } from '../../lib/approval';

/** "Leave requests are switched off by HR right now." - the note beside a create/submit control that is disabled
 *  because HR turned that workflow off. Renders nothing while the workflow is on, or when the summary is unknown. */
export function WorkflowOffNote({
  workflow,
  style,
}: {
  workflow?: ApprovalSummaryItem | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const note = workflowOffNote(workflow);
  if (!note) return null;
  return (
    <View style={[styles.box, style]}>
      <MaterialCommunityIcons name="pause-circle-outline" size={16} color={Colors.badgeYellowText} />
      <Text style={styles.text}>{note}</Text>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.badgeYellowBg,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  text: { flex: 1, color: Colors.badgeYellowText, fontSize: 12, lineHeight: 17, fontWeight: '600' },
});
