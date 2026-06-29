import React, { useState, useEffect, Component, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { AuthContext, AuthUser, checkAuth } from '../src/hooks/useAuth';
import { clearAuth } from '../src/lib/auth';
import { router } from 'expo-router';
import { Colors } from '../src/constants/colors';

// expo-notifications is NOT imported here because its push-token side effect
// throws an unrecoverable error in Expo Go SDK 53+. Use the Toast component
// for in-app notifications instead. Push notifications require a dev build.

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------
interface EBState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <ScrollView style={eb.container} contentContainerStyle={eb.content}>
          <Text style={eb.title}>Startup Error</Text>
          <Text style={eb.subtitle}>Share this with your developer:</Text>
          <View style={eb.box}>
            <Text style={eb.message}>{this.state.error?.message}</Text>
          </View>
          <Text style={eb.stack}>{this.state.error?.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingTop: 60 },
  title: { color: '#f97316', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 13, marginBottom: 16 },
  box: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  message: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  stack: { color: '#64748b', fontSize: 10, lineHeight: 16 },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------
export default function RootLayout() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth()
      .then((u) => { setUser(u); })
      .catch(() => {})
      .finally(() => { setIsLoading(false); });
  }, []);

  const login = async (_id: string, _pw: string) => {};

  const logout = async () => {
    await clearAuth();
    setUser(null);
    queryClient.clear();
    router.replace('/(auth)/login');
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ user, isLoading, login, logout, setUser }}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="salary" />
            <Stack.Screen name="shift" />
            <Stack.Screen name="requests" />
            <Stack.Screen name="settlement" />
            <Stack.Screen name="holidays" />
          </Stack>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
