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

import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

export default function AccountDeactivatedScreen() {
  const fade = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: slideUp }] }]}>
        {/* Lock icon bubble */}
        <View style={styles.iconOuter}>
          <View style={styles.iconInner}>
            <MaterialCommunityIcons name="lock-outline" size={48} color={Colors.textMuted} />
          </View>
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={styles.title}>Account Deactivated</Text>
          <Text style={styles.subtitle}>
            Your resignation has been approved and your account has been deactivated. Thank you for your time with UK Textiles.
          </Text>
        </View>

        {/* Info cards */}
        <View style={styles.cardsWrap}>
          {[
            {
              icon: 'file-document-outline',
              color: Colors.badgeBlueBg,
              iconColor: Colors.primary,
              text: 'Your employment records have been archived.',
            },
            {
              icon: 'wallet-outline',
              color: Colors.secondaryFixed,
              iconColor: Colors.secondary,
              text: 'Final settlement and dues will be processed as per company policy.',
            },
            {
              icon: 'phone-outline',
              color: Colors.badgeGreenBg,
              iconColor: Colors.statusGreen,
              text: 'For queries, contact HR at hr@uktex.net.',
            },
          ].map(({ icon, color, iconColor, text }, i) => (
            <View key={i} style={styles.infoCard}>
              <View style={[styles.infoIcon, { backgroundColor: color }]}>
                <MaterialCommunityIcons name={icon as any} size={18} color={iconColor} />
              </View>
              <Text style={styles.infoText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.replace('/(auth)/login')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color="#fff" />
          <Text style={styles.loginBtnText}>Go to Login</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 24,
  },

  iconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.bgSurfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  iconInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBlock: { alignItems: 'center', gap: 10 },
  title: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  cardsWrap: { width: '100%', gap: 10 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  infoIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },

  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
