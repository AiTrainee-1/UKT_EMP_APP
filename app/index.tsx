import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../src/hooks/useAuth';
import { Colors } from '../src/constants/colors';
import { FontFamily } from '../src/constants/typography';
import { BorderRadius } from '../src/constants/theme';
import { APP_VERSION_LABEL } from '../src/lib/appVersion';

/**
 * Startup screen: the branded entrance shown while the app signs the employee back in.
 *
 * It picks up exactly where the native launch screen leaves off. The logo is the same file
 * (app.json -> expo-splash-screen "image"), drawn at the same width and dead centre, on the same
 * background, so going from one to the other is invisible: there is never a moment with no logo.
 * The native launch screen is only dismissed once this screen has really been drawn (see
 * `hideNativeSplash`), never earlier, which is what used to leave a blank screen in between.
 *
 * This screen always uses the light palette on purpose: the native launch screen is always light,
 * and switching to a dark background halfway through startup would be a visible flash.
 */

const LOGO = require('../assets/splash-icon.png');
// Must equal "imageWidth" of expo-splash-screen in app.json so both logos are the same size.
const LOGO_SIZE = 160;
// Long enough for the entrance to play through even when sign-in is instant.
const MIN_VISIBLE_MS = 1200;

export default function StartupScreen() {
  const { user, isLoading } = useAuth();

  const [minTimePassed, setMinTimePassed] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [logoReady, setLogoReady] = useState(false);

  const logoScale = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(10)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Take the native launch screen away only after this one has been laid out with its logo, and
  // give it two frames to actually reach the screen.
  useEffect(() => {
    if (!laidOut || !logoReady) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => {});
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [laidOut, logoReady]);

  useEffect(() => {
    // The logo is already showing, so it only settles with a small bounce; the wordmark rises in.
    Animated.parallel([
      Animated.sequence([
        Animated.timing(logoScale, { toValue: 1.07, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(textOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(textTranslate, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.3, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.35, duration: 0, useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => pulse.start(), 450);
    return () => {
      clearTimeout(timer);
      pulse.stop();
    };
  }, []);

  if (!isLoading && minTimePassed) {
    return <Redirect href={user ? '/(tabs)/home' : '/(auth)/login'} />;
  }

  return (
    <LinearGradient colors={[Colors.clayBlue, Colors.bgLight]} style={styles.container} onLayout={() => setLaidOut(true)}>
      <View style={styles.logoStack}>
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" onLoad={() => setLogoReady(true)} />
        </Animated.View>
      </View>

      <Animated.View style={[styles.wordmark, { opacity: textOpacity, transform: [{ translateY: textTranslate }] }]}>
        <Text style={styles.title}>UKTextiles</Text>
        <Text style={styles.subtitle}>Employee Portal</Text>
        <View style={styles.versionPill}>
          <View style={styles.versionDot} />
          <Text style={styles.versionText}>Employee Portal {APP_VERSION_LABEL}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.dotsRow, { opacity: textOpacity }]}>
        <PulsingDot delay={0} />
        <PulsingDot delay={150} />
        <PulsingDot delay={300} />
      </Animated.View>
    </LinearGradient>
  );
}

function PulsingDot({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.6, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => anim.start(), delay);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, []);

  return <Animated.View style={[styles.dot, { transform: [{ scale }] }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The logo sits exactly in the middle of the screen, like the native launch screen's does.
  logoStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  pulseRing: {
    position: 'absolute',
    width: LOGO_SIZE * 1.3,
    height: LOGO_SIZE * 0.86,
    borderRadius: LOGO_SIZE * 0.43,
    backgroundColor: Colors.primaryLight,
  },
  // Below the logo, out of the flow, so the logo never moves when the text appears.
  wordmark: {
    position: 'absolute',
    top: '50%',
    marginTop: LOGO_SIZE / 2 - 4,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontFamily: FontFamily.displayBold,
    color: Colors.textPrimary,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FontFamily.bodySemibold,
    color: Colors.textMuted,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginTop: 14,
  },
  versionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.statusGreen },
  versionText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 64,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});
