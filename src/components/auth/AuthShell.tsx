import React, { useState } from 'react';
import { StatusBar, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { KeyboardAvoider, useKeyboardVisible } from '../KeyboardAvoider';
import { FormScrollView } from '../FormScrollView';
import { useTheme } from '../../theme/ThemeProvider';
import { BorderRadius } from '../../constants/theme';
import LightfallView from './LightfallView';
import { AuthColors } from './authTheme';

interface Props {
  /** What sits on the coloured header: the back / step row, brand, headline and subtitle. */
  header: React.ReactNode;
  /** The white sheet: the form and everything under it. */
  children: React.ReactNode;
}

/**
 * The page the three sign-in screens share: an animated emerald header (the Lightfall animation over a gradient) with a
 * white rounded sheet rising over its bottom edge, scrolling together and kept clear of the keyboard. It only arranges
 * things; every field, button and request stays on the screen that owns it.
 */
export function AuthShell({ header, children }: Props) {
  const { C: Colors } = useTheme();
  const keyboardVisible = useKeyboardVisible();
  const [headerHeight, setHeaderHeight] = useState(360);

  const onHeaderLayout = (e: LayoutChangeEvent) => setHeaderHeight(Math.ceil(e.nativeEvent.layout.height));

  return (
    <View style={[styles.root, { backgroundColor: Colors.bgCard }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* The coloured backdrop reaches 40 px under the sheet so its rounded corners never show a gap. */}
      <View pointerEvents="none" style={[styles.backdrop, { height: headerHeight + 40 }]}>
        <LinearGradient colors={AuthColors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LightfallView />
        {/* A soft dark-emerald veil from the top, so the white text stays readable over the brightest streaks. */}
        <LinearGradient
          colors={['rgba(3,45,40,0.62)', 'rgba(3,45,40,0.38)', 'rgba(3,45,40,0)']}
          locations={[0, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoider style={styles.flex}>
          <FormScrollView
            contentContainerStyle={[styles.scroll, keyboardVisible && styles.scrollKeyboard]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View onLayout={onHeaderLayout} style={styles.header}>
              {header}
            </View>

            <View style={[styles.sheet, { backgroundColor: Colors.bgCard }]}>
              <View style={[styles.grabber, { backgroundColor: Colors.outlineVariant }]} />
              {children}
            </View>
          </FormScrollView>
        </KeyboardAvoider>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  safe: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  scroll: { flexGrow: 1 },
  scrollKeyboard: { paddingBottom: 12 },
  header: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 54 },
  sheet: {
    flexGrow: 1,
    marginTop: -28,
    borderTopLeftRadius: BorderRadius.xxl + 8,
    borderTopRightRadius: BorderRadius.xxl + 8,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
  },
  grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginBottom: 16 },
});
