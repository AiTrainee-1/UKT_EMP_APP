import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { LiveFeedItem } from '../hooks/useHomeSummary';

interface Props {
  items: LiveFeedItem[];
}

function FeedChip({ item }: { item: LiveFeedItem }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const isIn = item.event === 'in';
  return (
    <View style={styles.chip}>
      <View style={[styles.chipIcon, { backgroundColor: isIn ? Colors.badgeGreenBg : Colors.badgeBlueBg }]}>
        <MaterialCommunityIcons
          name={isIn ? 'login' : 'logout'}
          size={12}
          color={isIn ? Colors.statusGreen : Colors.primary}
        />
      </View>
      <Text style={styles.chipText} numberOfLines={1}>
        <Text style={styles.chipName}>{isIn ? 'Checked in' : 'Checked out'}</Text>
        {' at '}
        <Text style={styles.chipTime}>{item.time}</Text>
      </Text>
    </View>
  );
}

export function LiveFeedTicker({ items }: Props) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const translateX = useRef(new Animated.Value(0)).current;
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    translateX.setValue(0);
    if (!rowWidth || items.length === 0) return;
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -rowWidth,
        duration: Math.max(8000, rowWidth * 30),
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [rowWidth, items.length]);

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.emptyText}>No recent punches yet today</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[styles.track, { transform: [{ translateX }] }]}
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width / 2)}
      >
        {[...items, ...items].map((item, i) => (
          <FeedChip key={i} item={item} />
        ))}
      </Animated.View>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    paddingVertical: 10,
  },
  track: { flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: Colors.outlineVariant,
  },
  chipIcon: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { color: Colors.textSecondary, fontSize: 12 },
  chipName: { color: Colors.textPrimary, fontWeight: '700' },
  chipTime: { color: Colors.textMuted, fontWeight: '600' },

  emptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  emptyText: { color: Colors.textMuted, fontSize: 12 },
});
