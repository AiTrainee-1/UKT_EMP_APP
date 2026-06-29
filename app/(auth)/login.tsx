import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';
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

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>UK</Text>
            </View>
            <Text style={styles.appName}>UKTextiles</Text>
            <Text style={styles.tagline}>Employee Portal</Text>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.heading}>Employee Login</Text>
            <Text style={styles.sub}>Enter your credentials to continue</Text>

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
                />
              )}
            />

            <Button
              title="Login"
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              style={styles.loginBtn}
            />
          </View>

          {/* Footer */}
          <TouchableOpacity onPress={() => router.push('/(auth)/set-password')} style={styles.link}>
            <Text style={styles.linkText}>
              First time?{' '}
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
  safe: {
    flex: 1,
    backgroundColor: Colors.bgDark,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  logoSection: {
    alignItems: 'center',
    gap: 8,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    color: Colors.textMuted,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 24,
    gap: 4,
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  sub: {
    color: Colors.textMuted,
    fontSize: 13,
    marginBottom: 20,
  },
  loginBtn: {
    marginTop: 8,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  linkAccent: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
