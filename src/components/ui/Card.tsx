import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { CardStyle } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...CardStyle,
  },
});
