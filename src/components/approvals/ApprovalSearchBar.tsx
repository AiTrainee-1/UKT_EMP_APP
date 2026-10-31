import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/** Narrow the list to one employee, by name or code. */
export function ApprovalSearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="magnify" size={18} color={Colors.textMuted} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.outline}
        selectionColor={Colors.primary}
        cursorColor={Colors.primary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search by employee name or code"
        testID="approvals-search"
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChange('')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <MaterialCommunityIcons name="close-circle" size={17} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.bgInput,
      borderWidth: 1,
      borderColor: Colors.outlineVariant,
    },
    input: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.bodyRegular, fontSize: 14, paddingVertical: 0 },
  });
