import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UKTLogo } from './UKTLogo';
import { Avatar } from './ui/Avatar';
import { useEmployee } from '../hooks/useEmployee';
import { useGeoPunchStatus } from '../hooks/useGeoAttendance';
import { Colors } from '../constants/colors';
import { BorderRadius } from '../constants/theme';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 300);

interface NavItem {
  icon: string;
  label: string;
  route: string;
  badge?: number;
  color?: string;
  staffOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'home-outline', label: 'Home', route: '/(tabs)/home', color: Colors.primary },
  { icon: 'calendar-check-outline', label: 'Attendance', route: '/(tabs)/attendance', color: '#27ae60' },
  { icon: 'map-marker-radius-outline', label: 'Attendance Request', route: '/geo-punch', color: '#0891b2' },
  { icon: 'briefcase-outline', label: 'On-Duty', route: '/on-duty', color: '#815600' },
  { icon: 'crosshairs-gps', label: 'Live Tracking', route: '/geo-tracking', color: '#0891b2' },
  { icon: 'cash-multiple', label: 'Salary Slips', route: '/salary', color: '#8e44ad' },
  { icon: 'umbrella-outline', label: 'Leave', route: '/(tabs)/leave', color: '#2980b9', staffOnly: true },
  { icon: 'hand-wave-outline', label: 'Permissions', route: '/requests', color: '#e67e22', staffOnly: true },
  { icon: 'clock-outline', label: 'My Shift', route: '/shift', color: '#16a085' },
  { icon: 'card-account-details-outline', label: 'Digital ID Card', route: '/idcard', color: '#2c3e50' },
  { icon: 'folder-outline', label: 'My Documents', route: '/documents', color: '#00897b' },
  { icon: 'flag-outline', label: 'Holidays', route: '/holidays', color: '#c0392b' },
  { icon: 'bank-transfer', label: 'Advances', route: '/settlement', color: '#7f8c8d' },
  { icon: 'chat-outline', label: 'Chat', route: '/chat', color: '#0984e3' },
];

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  user: { name: string; employeeId?: number } | null;
  onLogout: () => void;
  notificationCount?: number;
}

export function SideDrawer({ visible, onClose, user, onLogout, notificationCount = 0 }: SideDrawerProps) {
  const insets = useSafeAreaInsets();
  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data: geoStatus } = useGeoPunchStatus();
  const isProduction = employee?.employmentType === 'production';
  const onDutySessionStatus = geoStatus?.onDutySession?.status;
  const onDutyBadge =
    onDutySessionStatus === 'pending_hod' || onDutySessionStatus === 'pending_hr' || onDutySessionStatus === 'active'
      ? 1
      : 0;
  const visibleNavItems = NAV_ITEMS
    .filter((item) => !item.staffOnly || !isProduction)
    .map((item) => (item.route === '/on-duty' ? { ...item, badge: onDutyBadge || undefined } : item));
  const slideX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideX, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible && (slideX as any)._value <= -DRAWER_WIDTH) return null;

  const navigate = (route: string) => {
    onClose();
    setTimeout(() => router.push(route as any), 250);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          { width: DRAWER_WIDTH, paddingTop: insets.top, paddingBottom: insets.bottom + 16 },
          { transform: [{ translateX: slideX }] },
        ]}
      >
        {/* Header */}
        <LinearGradient
          colors={['#006496', '#0090d0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.drawerHeader}
        >
          <View style={styles.headerDeco1} />
          <View style={styles.headerDeco2} />

          <UKTLogo size={52} />
          <Text style={styles.companyName}>uktextiles</Text>

          <View style={styles.userRow}>
            <Avatar
              uri={employee?.photoUrl}
              name={user?.name}
              size={42}
              bgColor="rgba(255,255,255,0.22)"
              borderColor="rgba(255,255,255,0.4)"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Employee'}</Text>
              <Text style={styles.empId}>ID: {user?.employeeId || '—'}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Nav items */}
        <ScrollView
          style={styles.navScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.navContent}
        >
          {visibleNavItems.map(({ icon, label, route, badge, color }) => (
            <TouchableOpacity
              key={route}
              style={styles.navItem}
              onPress={() => navigate(route)}
              activeOpacity={0.75}
            >
              <View style={[styles.navIcon, { backgroundColor: `${color ?? Colors.primary}18` }]}>
                <MaterialCommunityIcons name={icon as any} size={20} color={color ?? Colors.primary} />
              </View>
              <Text style={styles.navLabel}>{label}</Text>
              {!!badge && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{badge}</Text>
                </View>
              )}
              <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outlineVariant} />
            </TouchableOpacity>
          ))}

          {/* Notifications */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => navigate('/(tabs)/notifications')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIcon, { backgroundColor: `${Colors.secondaryContainer}30` }]}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={Colors.secondary} />
            </View>
            <Text style={styles.navLabel}>Notifications</Text>
            {notificationCount > 0 && (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{notificationCount}</Text>
              </View>
            )}
            <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outlineVariant} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Profile */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => navigate('/(tabs)/profile')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIcon, { backgroundColor: `${Colors.primary}15` }]}>
              <MaterialCommunityIcons name="account-circle-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.navLabel}>My Profile</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outlineVariant} />
          </TouchableOpacity>

          {/* Company */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => navigate('/company')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIcon, { backgroundColor: `${Colors.primary}15` }]}>
              <MaterialCommunityIcons name="office-building-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.navLabel}>About Company</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outlineVariant} />
          </TouchableOpacity>

          {/* Resignation */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => navigate('/resignation/warning')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIcon, { backgroundColor: Colors.badgeRedBg }]}>
              <MaterialCommunityIcons name="file-sign" size={20} color={Colors.statusRed} />
            </View>
            <Text style={[styles.navLabel, { color: Colors.statusRed }]}>Resignation</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outlineVariant} />
          </TouchableOpacity>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
            <MaterialCommunityIcons name="logout" size={20} color={Colors.statusRed} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
          <Text style={styles.version}>uktextiles v1.0</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: Colors.bgLight,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.18, shadowRadius: 20 },
      android: { elevation: 16 },
    }),
  },

  drawerHeader: {
    padding: 20,
    paddingTop: 16,
    gap: 10,
    overflow: 'hidden',
  },
  headerDeco1: {
    position: 'absolute', top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerDeco2: {
    position: 'absolute', bottom: -30, right: 40,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  companyName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: -4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  userName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empId: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },

  navScroll: { flex: 1 },
  navContent: { paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'transparent',
  },
  navIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  navLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  navBadge: {
    backgroundColor: Colors.statusRed,
    borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  navBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  divider: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
    marginVertical: 8,
    marginHorizontal: 12,
  },

  footer: { paddingHorizontal: 12 },
  footerDivider: { height: 1, backgroundColor: Colors.outlineVariant, marginBottom: 12 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.badgeRedBg,
  },
  logoutText: { color: Colors.statusRed, fontSize: 14, fontWeight: '700' },
  version: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 10,
  },
});
