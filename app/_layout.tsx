import React, { useState, useEffect, Component, ReactNode, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { StatusBar } from 'expo-status-bar';
import { AuthContext, AuthUser, checkAuth, useAuth } from '../src/hooks/useAuth';
import { clearAuth } from '../src/lib/auth';
import { setUnauthorizedHandler } from '../src/lib/api';
import { router, type Href } from 'expo-router';
import { Colors } from '../src/constants/colors';
import { useMyResignation } from '../src/hooks/useResignation';
import { registerPushToken } from '../src/hooks/usePushToken';
import { useEmployee } from '../src/hooks/useEmployee';
import { startLiveTracking, stopLiveTracking, useGeoPunchStatus } from '../src/hooks/useGeoAttendance';
import { useNotificationObserver } from '../src/hooks/useNotifications';
import { PermissionGate } from '../src/components/PermissionGate';
import { UpdatePrompt } from '../src/components/UpdatePrompt';
import { ServerStatusBanner } from '../src/components/support/ServerStatusBanner';
import { prefetchSupportContact } from '../src/hooks/useSupportContact';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';

// Headline/body fonts are used on every screen (see src/constants/typography.ts),
// so loading is a hard gate, not a progressive enhancement — keep the splash
// screen up until they resolve rather than flashing system-font text first.
//
// The native launch screen is dismissed by the startup screen (app/index.tsx) once
// it has actually been drawn, so there is no blank frame between the two. Every other
// way of leaving it is a safety net so a launch can never get stuck on it:
// SPLASH_SAFETY_MS below, and the error boundary.
SplashScreen.preventAutoHideAsync().catch(() => {});
const SPLASH_SAFETY_MS = 2500;
// How long the signed-in screens get to slide away before the user and the cached data are dropped (see logout).
const SIGN_OUT_SETTLE_MS = 450;

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
  componentDidCatch() {
    // A startup crash must show its message, not sit behind the launch screen.
    SplashScreen.hideAsync().catch(() => {});
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
  const { user, logoutTo } = useAuth();
  const handledRef = useRef(false);
  const { data } = useMyResignation(user?.employeeId ?? null);

  useEffect(() => {
    if (data?.status === 'approved' && !handledRef.current) {
      handledRef.current = true;
      const name = user?.name ?? '';
      const lastWorkingDate = data?.lastWorkingDate ?? '';
      logoutTo({ pathname: '/resignation/deactivated', params: { name, lastWorkingDate } });
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
// Notification Tap Handler — useNotificationObserver() was previously
// defined but never mounted anywhere, so tapping a delivered push
// notification did nothing. Mounted once here; any tap opens the
// Notifications screen (the handler for actually DISPLAYING a delivered
// push in the system tray is already configured separately in
// useNotifications.ts's setNotificationHandler call).
// ---------------------------------------------------------------------------
function NotificationTapHandler() {
  useNotificationObserver(() => {
    router.push('/(tabs)/notifications');
  });
  return null;
}

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------
export default function RootLayout() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  useEffect(() => {
    checkAuth()
      .then((u) => { setUser(u); })
      .catch(() => {})
      .finally(() => { setIsLoading(false); });
  }, []);

  // The HR / software-support contact details (Settings -> HR Contact in the HR portal). Fetched at app
  // start, before anyone signs in, so a launch with a working server saves them on the phone and they are
  // still there on the login screen when the server is not. Never blocks or fails startup.
  useEffect(() => {
    prefetchSupportContact(queryClient).catch(() => {});
  }, []);

  // If the fonts fail to load the app still starts, with system fonts, instead of staying blank.
  const fontsReady = fontsLoaded || !!fontError;

  // Normally the startup screen dismisses the launch screen as soon as it is drawn. Opening the
  // app straight onto another screen (a tapped notification, a deep link) skips that screen, so
  // don't leave the launch screen up for longer than this.
  useEffect(() => {
    if (!fontsReady) return;
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), SPLASH_SAFETY_MS);
    return () => clearTimeout(timer);
  }, [fontsReady]);

  const login = async (_id: string, _pw: string) => {};

  // Signing out, in this order, is what keeps the screen from glitching for seconds afterwards:
  //  1. stop the background location pings and cancel every request still in flight;
  //  2. LEAVE the signed-in screens (they are what poll the server every 15-60 s and re-fetch the moment their
  //     data or the user disappears);
  //  3. forget the token, and only then - once those screens are gone - the user and the cached data.
  // Doing 3 before 2 (as this used to) made every mounted screen refetch without a token, collect a 401 each, and
  // every 401 reopened the Login screen.
  const signingOut = useRef(false);
  const logoutTo = async (to: Href) => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      stopLiveTracking();
      await queryClient.cancelQueries();
      router.replace(to);
      await clearAuth();
      setTimeout(() => {
        setUser(null);
        queryClient.clear();
        signingOut.current = false;
      }, SIGN_OUT_SETTLE_MS);
    } catch {
      signingOut.current = false;
    }
  };

  // The server saying the session is over (401) signs out the same way, exactly once.
  const logout = () => logoutTo('/(auth)/login');
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  useEffect(() => {
    setUnauthorizedHandler(() => logoutRef.current());
    return () => setUnauthorizedHandler(null);
  }, []);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ user, isLoading, login, logout, logoutTo, setUser }}>
          <StatusBar style="light" />
          <PermissionGate />
          <UpdatePrompt />
          <ResignationGuard />
          <PushTokenRegistrar />
          <LiveLocationTracker />
          <NotificationTapHandler />
          {/* The server-status bar takes its own strip above the navigator, so it never covers a screen. */}
          <View style={{ flex: 1 }}>
          <ServerStatusBanner />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="salary" />
            <Stack.Screen name="shift" />
            <Stack.Screen name="documents" />
            <Stack.Screen name="requests" />
            <Stack.Screen name="missing-punch" />
            <Stack.Screen name="settlement" />
            <Stack.Screen name="holidays" />
            <Stack.Screen name="resignation" />
            <Stack.Screen name="idcard" />
            <Stack.Screen name="chat" />
            <Stack.Screen name="company" />
            <Stack.Screen name="geo-punch" />
            <Stack.Screen name="geo-tracking" />
            <Stack.Screen name="on-duty" />
            <Stack.Screen name="outpass" />
            <Stack.Screen name="help" />
          </Stack>
          </View>
          </AuthContext.Provider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
