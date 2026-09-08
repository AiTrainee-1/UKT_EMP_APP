import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { useManagerProfile } from '../../src/hooks/useManager';
import { useTheme } from '../../src/theme/ThemeProvider';
import { DockTabIcon } from '../../src/components/DockTabIcon';

export const TAB_BAR_CONTENT_HEIGHT = Platform.OS === 'ios' ? 58 : 62;

/**
 * Four primary destinations -Home, Attendance, My Shift, Profile -plus
 * Approvals for department heads only.
 *
 * Uses the built-in tab bar deliberately. A custom `tabBar` renders whatever
 * is in `state.routes`, and expo-router's `href: null` does NOT remove a
 * route from that array -it only suppresses the button the built-in bar
 * would draw. A custom bar therefore has to re-implement that filtering, and
 * getting it wrong shows every hidden route (Leave, Alerts, and Approvals
 * for non-managers) as an unlabelled extra tab. The built-in bar handles it
 * correctly, so it stays.
 *
 * Leave and Alerts remain reachable -Alerts from the permanent bell in the
 * home header, Leave from Quick Actions -they are just not primary tabs.
 */
export default function TabsLayout() {
  // The tab bar previously hardcoded paddingBottom to 8 on Android, which
  // ignores whatever the system navigation actually occupies. With gesture
  // navigation that's ~16-24dp; with 3-button navigation it's ~48dp, so the
  // bar was drawn underneath the system bar and the icons were partly
  // unreachable. Expo SDK 54's Android edge-to-edge makes this worse, since
  // the app now draws behind the system bars by default. Reading the real
  // inset covers every navigation mode and device.
  const insets = useSafeAreaInsets();
  const { C: Colors } = useTheme();

  // Phones on 3-button navigation report a much larger bottom inset (~48dp)
  // than gesture navigation (~16-24dp). Sitting the icons directly on top of
  // that strip puts them within a thumb-width of the system Back/Home keys,
  // where they are easy to miss and easy to mis-tap. Lift the bar clear of it.
  const hardwareNavButtons = insets.bottom > 28;
  const bottomInset = Math.max(insets.bottom, 10) + (hardwareNavButtons ? 12 : 6);
  const { user } = useAuth();
  const { data: manager } = useManagerProfile(!!user);

  const isManager = manager?.isManager ?? false;
  const summedCount =
    (manager?.pendingLeavesCount ?? 0) +
    (manager?.pendingPermissionsCount ?? 0) +
    (manager?.pendingResignationsCount ?? 0);
  const pendingCount = summedCount || (manager?.pendingApprovalsCount ?? 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bgCard,
          borderTopColor: Colors.outlineVariant,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
          // Floor of 10 so devices reporting a 0 inset (older Android, some
          // emulators) still get breathing room rather than flush-to-edge.
          paddingBottom: bottomInset,
          paddingTop: 8,
          ...Platform.select({
            ios: {
              shadowColor: Colors.primary,
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
            },
            android: { elevation: 12 },
          }),
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <DockTabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <DockTabIcon name={focused ? 'calendar-check' : 'calendar-check-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="shift"
        options={{
          title: 'My Shift',
          tabBarIcon: ({ color, focused }) => (
            <DockTabIcon name={focused ? 'clock' : 'clock-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Approvals',
          href: isManager ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <DockTabIcon name={focused ? 'clipboard-check' : 'clipboard-check-outline'} color={color} focused={focused} />
          ),
          tabBarBadge: isManager && pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Colors.badgeRedBg,
            color: Colors.badgeRedText,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <DockTabIcon name={focused ? 'account-circle' : 'account-circle-outline'} color={color} focused={focused} />
          ),
        }}
      />

      {/* Routable, never a tab. */}
      <Tabs.Screen name="leave" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
