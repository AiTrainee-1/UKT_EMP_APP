import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { UKTLogo } from '../../src/components/UKTLogo';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/hooks/useAuth';
import { loginRequest } from '../../src/hooks/useAuth';

const schema = z.object({
  identifier: z.string().min(1, 'Employee Code is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const { setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '',
    type: 'error',
    visible: false,
  });

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const result = await loginRequest(data.identifier, data.password);
      setUser({ employeeId: result.employeeId, name: result.name, role: result.role });
      router.replace('/(tabs)/home');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Invalid credentials. Please try again.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      {/* Decorative circles — anchored to the screen, not scroll content,
          so they don't jump when the keyboard opens and content re-centers */}
      <View pointerEvents="none" style={styles.decorWrap}>
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <UKTLogo size={72} />
            <View style={styles.brandRow}>
              <Text style={styles.brand}>uk</Text>
              <Text style={styles.brandTail}>textiles</Text>
            </View>
            <View style={styles.taglineRow}>
              <View style={styles.taglineDot} />
              <Text style={styles.tagline}>Employee Self-Service Portal</Text>
              <View style={styles.taglineDot} />
            </View>
          </View>

          {/* Welcome chip */}
          <View style={styles.chip}>
            <MaterialCommunityIcons name="hand-wave-outline" size={15} color={Colors.onSecondaryContainer} />
            <Text style={styles.chipText}>Welcome back! Please sign in</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Sign In</Text>

            <Controller
              control={control}
              name="identifier"
              render={({ field: { onChange, value, onBlur } }) => (
                <Input
                  label="Employee Code"
                  placeholder="e.g. 30020"
                  keyboardType="numeric"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.identifier?.message}
                  returnKeyType="next"
                  leftIconName="badge-account-outline"
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value, onBlur } }) => (
                <Input
                  label="Password"
                  placeholder="Enter your password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  isPassword
                  error={errors.password?.message}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  leftIconName="lock-outline"
                />
              )}
            />

            <View style={styles.btnWrap}>
              <Button title="Sign In" onPress={handleSubmit(onSubmit)} loading={loading} />
            </View>
          </View>

          {/* Footer */}
          <TouchableOpacity onPress={() => router.push('/(auth)/set-password')} style={styles.link}>
            <MaterialCommunityIcons name="key-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.linkText}>
              First time?{'  '}
              <Text style={styles.linkAccent}>Set your password</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 20 },
  decorWrap: { position: 'absolute', top: -40, right: -30, zIndex: 0 },
  decorCircle1: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.primaryFixed,
    opacity: 0.5,
  },
  decorCircle2: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.secondaryFixed,
    opacity: 0.6,
    position: 'absolute',
    bottom: -10,
    right: 30,
  },
  logoSection: { alignItems: 'center', gap: 10, zIndex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'baseline' },
  brand: { color: Colors.primary, fontSize: 27, fontWeight: '900', letterSpacing: 0.5 },
  brandTail: { color: Colors.textPrimary, fontSize: 27, fontWeight: '700', letterSpacing: 0.5 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taglineDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.secondaryContainer },
  tagline: { color: Colors.textMuted, fontSize: 11, letterSpacing: 0.8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: Colors.secondaryFixed,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    ...Platform.select({
      ios: {
        shadowColor: '#735c00',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.10,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  chipText: { color: Colors.onSecondaryContainer, fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    padding: 24,
    gap: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#006496',
        shadowOffset: { width: 6, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
    }),
  },
  heading: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 14 },
  btnWrap: { marginTop: 10 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  linkText: { color: Colors.textMuted, fontSize: 14 },
  linkAccent: { color: Colors.primary, fontWeight: '700' },
});
