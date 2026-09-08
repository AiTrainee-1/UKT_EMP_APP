import React from 'react';
import { View, ViewStyle, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding = 16 }: CardProps) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#006496',
        shadowOffset: { width: 4, height: 6 },
        shadowOpacity: 0.10,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
    }),
  },
});
