import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useManagerProfile } from '../../src/hooks/useManager';
import { useAppNotifications } from '../../src/hooks/useAppNotifications';
import { useEmployee } from '../../src/hooks/useEmployee';
import { Colors } from '../../src/constants/colors';

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  return (
    <View style={[icon.wrap, focused && icon.active]}>
      <MaterialCommunityIcons name={name as any} size={22} color={color} />
    </View>
  );
}

const icon = StyleSheet.create({
  wrap: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  active: {
    backgroundColor: Colors.primaryFixed,
  },
});

export default function TabsLayout() {
  const { user } = useAuth();
  const { data: manager } = useManagerProfile(!!user);
  const { data: notifs } = useAppNotifications(user?.employeeId ?? null);
  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const unreadNotifs = notifs?.filter(n => !n.isRead).length ?? 0;

  const isManager = manager?.isManager ?? false;
  const isProduction = employee?.employmentType === 'production';
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
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 22 : 8,
          paddingTop: 6,
          ...Platform.select({
            ios: {
              shadowColor: '#006496',
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
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'calendar-check' : 'calendar-check-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: 'Leave',
          href: isProduction ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'umbrella' : 'umbrella-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Approvals',
          href: isManager ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'clipboard-check' : 'clipboard-check-outline'} color={color} focused={focused} />
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
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'bell' : 'bell-outline'} color={color} focused={focused} />
          ),
          tabBarBadge: unreadNotifs > 0 ? unreadNotifs : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Colors.secondaryContainer,
            color: Colors.secondary,
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
            <TabIcon name={focused ? 'account-circle' : 'account-circle-outline'} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
