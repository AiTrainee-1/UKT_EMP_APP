import React, { useState, useEffect, Component, ReactNode, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { AuthContext, AuthUser, checkAuth, useAuth } from '../src/hooks/useAuth';
import { clearAuth } from '../src/lib/auth';
import { router } from 'expo-router';
import { Colors } from '../src/constants/colors';
import { useMyResignation } from '../src/hooks/useResignation';
import { registerPushToken } from '../src/hooks/usePushToken';
import { useEmployee } from '../src/hooks/useEmployee';
import { startLiveTracking, stopLiveTracking, useGeoPunchStatus } from '../src/hooks/useGeoAttendance';
import * as Location from 'expo-location';

// registerPushToken() (src/hooks/usePushToken.ts) guards internally against
// Expo Go, where the push-token APIs throw an unrecoverable error on SDK
// 53+ — it no-ops there and only actually registers a token in a real EAS
// build. Safe to call unconditionally below.

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
// Resignation Guard — polls /api/my/resignation; deactivates on approval
// ---------------------------------------------------------------------------
function ResignationGuard() {
  const { user, setUser } = useAuth();
  const handledRef = useRef(false);
  const { data } = useMyResignation(user?.employeeId ?? null);

  useEffect(() => {
    if (data?.status === 'approved' && !handledRef.current) {
      handledRef.current = true;
      clearAuth().then(() => {
        setUser(null);
        queryClient.clear();
        router.replace('/resignation/deactivated');
      });
    }
  }, [data?.status]);

  return null;
}

// ---------------------------------------------------------------------------
// Push Token Registrar — registers this device once per login session
// ---------------------------------------------------------------------------
function PushTokenRegistrar() {
  const { user } = useAuth();
  const registeredRef = useRef<number | null>(null);

  useEffect(() => {
    if (user?.employeeId && registeredRef.current !== user.employeeId) {
      registeredRef.current = user.employeeId;
      registerPushToken();
    }
  }, [user?.employeeId]);

  return null;
}

// ---------------------------------------------------------------------------
// Live Location Tracker — auto-RESUMES pinging (never auto-PROMPTS) while
// the employee's own profile has locationTrackingEnabled=true (an HR-only
// toggle, off by default). The actual permission dialog only ever appears
// from the dedicated Live Tracking screen (app/geo-tracking), tied to a
// real button tap — requesting it from a background effect like this one
// used to mean the OS prompt could be silently skipped/deferred on some
// Android builds, which is why tracking looked "broken" even after HR
// enabled it. This component only checks (never requests) permission: if
// the employee already granted it in an earlier visit to that screen,
// tracking resumes here automatically on every app open; if not, it stays
// idle until they visit the screen once.
// ---------------------------------------------------------------------------
function LiveLocationTracker() {
  const { user } = useAuth();
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data: geoStatus } = useGeoPunchStatus(!!user?.employeeId);
  const enabled = !!emp?.locationTrackingEnabled || geoStatus?.onDutySession?.status === 'active';

  useEffect(() => {
    if (!enabled) {
      stopLiveTracking();
      return;
    }
    let cancelled = false;
    Location.getForegroundPermissionsAsync().then((perm) => {
      if (!cancelled && perm.granted) startLiveTracking();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}

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
    stopLiveTracking();
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
          <ResignationGuard />
          <PushTokenRegistrar />
          <LiveLocationTracker />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="salary" />
            <Stack.Screen name="shift" />
            <Stack.Screen name="documents" />
            <Stack.Screen name="requests" />
            <Stack.Screen name="settlement" />
            <Stack.Screen name="holidays" />
            <Stack.Screen name="resignation" />
            <Stack.Screen name="idcard" />
            <Stack.Screen name="chat" />
            <Stack.Screen name="company" />
            <Stack.Screen name="geo-punch" />
            <Stack.Screen name="geo-tracking" />
            <Stack.Screen name="on-duty" />
          </Stack>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
