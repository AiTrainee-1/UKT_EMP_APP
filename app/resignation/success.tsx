import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

export default function ResignationSuccessScreen() {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1,
        delay: 200,
        useNativeDriver: true,
        tension: 120,
        friction: 6,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#1b5e20" />

      <LinearGradient colors={['#2e7d32', '#1b5e20']} style={styles.bg}>
        {/* Deco circles */}
        <View style={styles.deco1} />
        <View style={styles.deco2} />
        <View style={styles.deco3} />

        {/* Animated checkmark */}
        <Animated.View style={[styles.checkBubble, { transform: [{ scale }] }]}>
          <View style={styles.checkInner}>
            <MaterialCommunityIcons name="check-bold" size={52} color="#2e7d32" />
          </View>
        </Animated.View>

        <Animated.View style={[styles.textBlock, { opacity: fade }]}>
          <Text style={styles.title}>Resignation Submitted</Text>
          <Text style={styles.subtitle}>
            Your resignation has been sent to HR for review. You'll be notified once a decision is made.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.cardsWrap, { opacity: fade }]}>
          {[
            { icon: 'clock-outline', text: 'HR typically responds within 2–5 business days.' },
            { icon: 'bell-ring-outline', text: 'You will receive a notification when the decision is ready.' },
            { icon: 'shield-check-outline', text: 'Your account remains active until your resignation is approved.' },
          ].map(({ icon, text }, i) => (
            <View key={i} style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <MaterialCommunityIcons name={icon as any} size={18} color="#2e7d32" />
              </View>
              <Text style={styles.infoText}>{text}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={{ opacity: fade, width: '100%' }}>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.replace('/(tabs)/home')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="home-outline" size={20} color="#2e7d32" />
            <Text style={styles.homeBtnText}>Return to Home</Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
    overflow: 'hidden',
  },

  deco1: {
    position: 'absolute', top: -60, right: -60,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  deco2: {
    position: 'absolute', bottom: -40, left: -40,
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  deco3: {
    position: 'absolute', top: '40%', left: -30,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  checkBubble: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  checkInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBlock: { alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  cardsWrap: { width: '100%', gap: 10 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: BorderRadius.lg,
    padding: 14,
  },
  infoIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },

  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  homeBtnText: { color: '#2e7d32', fontSize: 15, fontWeight: '800' },
});
