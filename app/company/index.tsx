import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import { useFonts } from 'expo-font';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
// Per-weight entry points, so only the three faces this screen uses are bundled.
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';

import { FontFamily } from '../../src/constants/typography';
import { useAppActive, useReduceMotion } from '../../src/lib/motionPrefs';
import { AboutFontsContext, FALLBACK_FONTS, LOADED_FONTS, SKIN } from '../../src/components/company/aboutSkin';
import { MotionProvider, ScrollProvider, useScreenReader, type ScrollState } from '../../src/components/company/AboutMotion';
import { PageBackdrop } from '../../src/components/company/AboutVisuals';
import {
  AboutSection,
  ClientsSection,
  ContactSection,
  FooterSection,
  HeroSection,
  PeopleSection,
  ProcessSection,
  QualitySection,
  SegmentsSection,
  StatsSection,
  TapesSection,
  VisionSection,
} from '../../src/components/company/AboutSections';

/**
 * About UK Textiles. Every fact is from the company's website (uktextiles.in); the content and
 * the rules behind the visuals live in src/lib/companyProfile.ts.
 *
 * The look follows the owner's demo sites: a dark midnight-indigo canvas with cream and royal-
 * indigo colour blocks (the same in the app's light and dark themes), a giant outlined wordmark,
 * drifting threads, marquee tapes, count-up stats and numbered cards. No images: type, shapes,
 * gradients and SVG only.
 *
 * Fonts: Bricolage Grotesque (display) and Instrument Serif italic (accent) are loaded here only.
 * Until they are ready a calm placeholder shows; if they fail (or take over 3 s) the screen uses
 * Sora + the system serif instead, so it never blocks.
 */

const FONT_TIMEOUT_MS = 3000;

export default function CompanyScreen() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    BricolageGrotesque_600SemiBold,
    InstrumentSerif_400Regular_Italic,
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const t = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);
  const ready = fontsLoaded || !!fontError || timedOut;
  const fonts = fontsLoaded ? LOADED_FONTS : FALLBACK_FONTS;

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReader();

  const scrollY = useSharedValue(0);
  const goBack = useCallback(() => router.back(), []);

  return (
    <View style={styles.root}>
      {/* Light icons on the dark canvas, only while this screen is the one showing. */}
      {isFocused && <StatusBar barStyle="light-content" />}
      <PageBackdrop width={width} height={height + insets.top + insets.bottom} />
      <SafeAreaView edges={['top']} style={styles.flex}>
        <TopBar onBack={goBack} scrollY={scrollY} />
        {ready ? (
          <AboutFontsContext.Provider value={fonts}>
            <AboutBody
              width={width}
              scrollY={scrollY}
              still={reduceMotion || screenReader}
              reduce={reduceMotion}
              motion={isFocused && appActive && !reduceMotion}
              bottomInset={insets.bottom}
            />
          </AboutFontsContext.Provider>
        ) : (
          <View style={styles.placeholder} accessible accessibilityLabel="Loading About UK Textiles">
            <ActivityIndicator color={SKIN.butter} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const TopBar = memo(function TopBar({ onBack, scrollY }: { onBack: () => void; scrollY: SharedValue<number> }) {
  // The hairline under the bar appears once the page has scrolled under it.
  const rule = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, scrollY.value / 40)) }));
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={6}
      >
        <MaterialCommunityIcons name="arrow-left" size={22} color={SKIN.cream} />
      </Pressable>
      <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
        About UK Textiles
      </Text>
      <Text style={styles.topTag} accessibilityElementsHidden importantForAccessibility="no">
        EST. 1993
      </Text>
      <Animated.View style={[styles.topRule, rule]} pointerEvents="none" />
    </View>
  );
});

const AboutBody = memo(function AboutBody({
  width,
  scrollY,
  still,
  reduce,
  motion,
  bottomInset,
}: {
  width: number;
  scrollY: SharedValue<number>;
  still: boolean;
  reduce: boolean;
  motion: boolean;
  bottomInset: number;
}) {
  const viewportH = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const aboutTop = useRef(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const scroll: ScrollState = useMemo(() => ({ y: scrollY, vh: viewportH, still, reduce }), [scrollY, viewportH, still, reduce]);

  const onAboutTop = useCallback((y: number) => {
    aboutTop.current = y;
  }, []);
  const toStory = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, aboutTop.current - 8), animated: !reduce });
  }, [reduce]);
  const toHelp = useCallback(() => router.push('/help'), []);

  return (
    <ScrollProvider value={scroll}>
      <MotionProvider value={motion}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => {
            viewportH.value = e.nativeEvent.layout.height;
          }}
          contentContainerStyle={{ paddingBottom: bottomInset + 28 }}
        >
          <HeroSection width={width} onStory={toStory} onContactHr={toHelp} />
          <StatsSection width={width} />
          <TapesSection />
          <AboutSection width={width} onTop={onAboutTop} />
          <ProcessSection width={width} />
          <SegmentsSection />
          <QualitySection />
          <PeopleSection width={width} onContactHr={toHelp} />
          <VisionSection />
          <ClientsSection />
          <ContactSection onContactHr={toHelp} />
          <FooterSection width={width} />
        </Animated.ScrollView>
      </MotionProvider>
    </ScrollProvider>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SKIN.ink1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 56,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: SKIN.hairDark,
  },
  topTitle: { flex: 1, color: SKIN.cream, fontFamily: FontFamily.bodySemibold, fontSize: 16 },
  topTag: {
    color: SKIN.faintOnDark,
    fontFamily: LOADED_FONTS.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    paddingRight: 6,
  },
  topRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(252,240,214,0.24)' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
