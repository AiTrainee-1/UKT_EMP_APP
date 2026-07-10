import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '../../src/components/ui/Button';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const WARNINGS = [
  {
    icon: 'account-supervisor-outline',
    text: 'Your resignation will first go to your Department Head for review, then to HR for final approval.',
  },
  {
    icon: 'check-decagram-outline',
    text: 'Your account will be deactivated upon final HR approval.',
  },
  {
    icon: 'clock-remove-outline',
    text: 'You cannot withdraw a resignation once it has been approved at any stage.',
  },
  {
    icon: 'wallet-outline',
    text: 'Your final settlement and dues will be processed after the last working date.',
  },
];

export default function ResignationWarningScreen() {
  const shake = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    const shakeSeq = Animated.sequence([
      Animated.delay(600),
      Animated.timing(shake, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]);
    shakeSeq.start();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#b71c1c" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Red header */}
        <LinearGradient
          colors={['#c62828', '#b71c1c']}
          style={styles.header}
        >
          <View style={styles.headerDeco} />
          <Animated.View style={{ transform: [{ translateX: shake }] }}>
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons name="alert" size={44} color="#fff" />
            </View>
          </Animated.View>
          <Text style={styles.headerTitle}>Before You Continue</Text>
          <Text style={styles.headerSub}>
            Submitting a resignation is a serious step. Please read the following carefully.
          </Text>
        </LinearGradient>

        {/* Warning cards */}
        <Animated.View style={[styles.body, { opacity: fadeIn }]}>
          {WARNINGS.map(({ icon, text }, i) => (
            <View key={i} style={styles.warnCard}>
              <View style={styles.warnIcon}>
                <MaterialCommunityIcons name={icon as any} size={22} color={Colors.statusRed} />
              </View>
              <Text style={styles.warnText}>{text}</Text>
            </View>
          ))}

          {/* Confirm chip */}
          <View style={styles.confirmChip}>
            <MaterialCommunityIcons name="information-outline" size={15} color={Colors.onSecondaryContainer} />
            <Text style={styles.confirmChipText}>
              Pressing "I Understand" does not submit your resignation — you will fill out a short survey first.
            </Text>
          </View>

          {/* Actions */}
          <Button
            title="I Understand, Continue"
            onPress={() => router.push('/resignation/survey')}
            style={styles.continueBtn}
          />
          <Button
            title="Go Back"
            variant="ghost"
            onPress={() => router.back()}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  scroll: { flexGrow: 1 },

  header: {
    padding: 28,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  iconBubble: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },

  body: {
    padding: 20,
    gap: 12,
    paddingTop: 24,
  },
  warnCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.clayRed,
    ...Platform.select({
      ios: { shadowColor: '#c62828', shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  warnIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.badgeRedBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  warnText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  confirmChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.secondaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginTop: 4,
  },
  confirmChipText: {
    flex: 1,
    color: Colors.onSecondaryContainer,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },

  continueBtn: { marginTop: 8 },
});
