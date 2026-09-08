import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Alert,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, setPasswordRequest } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useLocalProfilePhoto } from '../../src/hooks/useLocalProfilePhoto';
import { useMyResignation } from '../../src/hooks/useResignation';
import { ProfileSection } from '../../src/components/ProfileSection';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Badge } from '../../src/components/ui/Badge';
import { Avatar } from '../../src/components/ui/Avatar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';

const pwdSchema = z
  .object({
    identifier: z.string().min(1),
    newPassword: z.string().min(8, 'Minimum 8 characters'),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type PwdForm = z.infer<typeof pwdSchema>;

function maskAccount(acc: string) {
  if (!acc || acc.length < 4) return acc;
  return '*'.repeat(acc.length - 4) + acc.slice(-4);
}

export default function ProfileScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user, logout } = useAuth();
  const { data: emp, isLoading } = useEmployee(user?.employeeId ?? null);
  const { data: resignation } = useMyResignation(user?.employeeId ?? null);
  const localPhoto = useLocalProfilePhoto(user?.employeeId ?? null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<PwdForm>({
    resolver: zodResolver(pwdSchema),
    defaultValues: { identifier: user?.employeeId?.toString() ?? '', newPassword: '', confirmPassword: '' },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const handleChangePwd = async (data: PwdForm) => {
    setPwdLoading(true);
    try {
      await setPasswordRequest(data.identifier, data.newPassword);
      showToast('Password changed successfully!', 'success');
      setShowPwd(false);
      reset();
    } catch {
      showToast('Failed to change password.', 'error');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const HERO_HEIGHT = 220;
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, HERO_HEIGHT],
    outputRange: [50, 0, -HERO_HEIGHT * 0.4],
    extrapolateRight: 'clamp',
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: 'clamp',
  });
  const heroContentOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.55],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Picks a photo and stores it on this device only — see
  // useLocalProfilePhoto for why this never touches the server.
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Photo library permission is required.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Squared by the crop above and only ever displayed at avatar size,
      // so mid quality keeps the stored base64 comfortably small.
      quality: 0.5,
      base64: true,
    });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      showToast('Could not read that image. Please try another.', 'error');
      return;
    }

    setSavingPhoto(true);
    try {
      const mime = asset.mimeType || 'image/jpeg';
      await localPhoto.savePhoto(`data:${mime};base64,${asset.base64}`);
      showToast('Profile photo updated on this device.', 'success');
    } catch {
      showToast('Failed to save photo. Please try again.', 'error');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handlePickPhoto = () => {
    // Once a device photo exists, tapping offers removal too — that's the
    // only way back to the official portal photo.
    if (!localPhoto.photo) {
      pickPhoto();
      return;
    }
    Alert.alert(
      'Profile photo',
      'This photo is saved on this device only. Your official HR photo is unchanged.',
      [
        { text: 'Choose new photo', onPress: pickPhoto },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await localPhoto.clearPhoto();
              showToast('Reverted to your official HR photo.', 'success');
            } catch {
              showToast('Failed to remove photo. Please try again.', 'error');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const isProduction = emp?.employmentType === 'production';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* Hero card — parallax: shrinks/slides on scroll, avatar/name/badges fade out */}
            <Animated.View style={{ transform: [{ translateY: heroTranslateY }, { scale: heroScale }] }}>
              <LinearGradient
                colors={Colors.gradientRoyal}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                {/* Decorative circles */}
                <View style={styles.heroDeco1} />
                <View style={styles.heroDeco2} />

                <View style={styles.heroTopRow}>
                  <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color="#fff" size={20} />
                </View>

                <Animated.View style={{ opacity: heroContentOpacity, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={styles.avatarWrap}
                    onPress={handlePickPhoto}
                    activeOpacity={0.85}
                    disabled={savingPhoto}
                  >
                    {/* Device photo wins over the portal photo on this
                        device; falling back to emp.photoUrl when none set. */}
                    <Avatar
                      uri={localPhoto.photo ?? emp?.photoUrl}
                      name={emp?.name}
                      size={88}
                      borderColor="rgba(255,255,255,0.5)"
                    />
                    <View style={styles.avatarEditBadge}>
                      {savingPhoto ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <MaterialCommunityIcons name="camera" size={14} color={Colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.empName}>{emp?.name}</Text>
                  <Text style={styles.empSub}>{emp?.employeeCode} · {emp?.designationTitle}</Text>
                  <View style={styles.heroBadgeRow}>
                    <Badge label={emp?.status || 'Active'} variant="present" />
                    <View style={styles.typeChip}>
                      <MaterialCommunityIcons
                        name={isProduction ? 'factory' : 'briefcase-outline'}
                        size={12}
                        color="#fff"
                      />
                      <Text style={styles.typeChipText}>{isProduction ? 'Production' : 'Staff'}</Text>
                    </View>
                    <View style={styles.deptChip}>
                      <Text style={styles.deptText}>{emp?.departmentName || 'Department'}</Text>
                    </View>
                  </View>
                </Animated.View>
              </LinearGradient>
            </Animated.View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {[
                { label: 'Phone', value: emp?.phone || '—', icon: 'phone-outline' },
                { label: 'Join Date', value: emp?.joinDate || '—', icon: 'calendar-outline' },
              ].map(({ label, value, icon }) => (
                <View key={label} style={styles.statCard}>
                  <MaterialCommunityIcons name={icon as any} size={18} color={Colors.primary} />
                  <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Sections */}
            <ProfileSection
              title="Personal Information"
              icon="account-outline"
              defaultOpen
              rows={[
                { label: 'Full Name', value: emp?.name || '' },
                { label: 'Gender', value: emp?.gender || '' },
                { label: 'Date of Birth', value: emp?.dateOfBirth || '' },
                { label: 'Email', value: emp?.email || '' },
                { label: 'Phone', value: emp?.phone || '' },
                { label: 'Blood Group', value: emp?.bloodGroup || '' },
                { label: 'Emergency Contact', value: emp?.emergencyContact || '' },
              ]}
            />
            <ProfileSection
              title="Family Information"
              icon="account-group-outline"
              rows={[
                { label: "Father's Name", value: emp?.fatherName || '' },
                { label: "Mother's Name", value: emp?.motherName || '' },
              ]}
            />
            <ProfileSection
              title="Employee Information"
              icon="briefcase-outline"
              rows={[
                { label: 'Employee Code', value: emp?.employeeCode || '' },
                { label: 'Employment Type', value: isProduction ? 'Production' : 'Staff' },
                { label: 'Role', value: emp?.role || '' },
                { label: 'Department', value: emp?.departmentName || '' },
                { label: 'Designation', value: emp?.designationTitle || '' },
                { label: 'Join Date', value: emp?.joinDate || '' },
                { label: 'Status', value: emp?.status || '' },
              ]}
            />
            <ProfileSection
              title="Bank Information"
              icon="bank-outline"
              rows={[
                { label: 'Bank Name', value: emp?.bankName || '' },
                { label: 'Account Number', value: maskAccount(emp?.bankAccount || '') },
                { label: 'IFSC Code', value: emp?.bankIfsc || '' },
              ]}
            />
            <ProfileSection
              title="Compliance Information"
              icon="shield-check-outline"
              rows={[
                { label: 'PF Number', value: emp?.pfNumber || '' },
                { label: 'ESI Number', value: emp?.esiNumber || '' },
                { label: 'UAN Number', value: emp?.uanNumber || '' },
              ]}
            />
            <ProfileSection
              title="Address Information"
              icon="map-marker-outline"
              rows={[{ label: 'Address', value: emp?.address || '' }]}
            />

            {/* Actions */}
            <View style={styles.actionsWrap}>
              <TouchableOpacity style={styles.actionRow} onPress={() => setShowPwd(true)}>
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons name="lock-reset" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.actionLabel}>Change Password</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              {(resignation?.status === 'pending' || resignation?.status === 'dept_approved') ? (
                <View style={styles.actionRow}>
                  <View style={[styles.actionIcon, { backgroundColor: Colors.badgeYellowBg }]}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color={Colors.statusYellow} />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={[styles.actionLabel, { color: Colors.statusYellow }]}>Resignation In Progress</Text>
                    {/* 3-step progress */}
                    <View style={resignSt.steps}>
                      {[
                        { label: 'Submitted', done: true },
                        { label: 'Dept Head', done: resignation.status === 'dept_approved' },
                        { label: 'HR Final', done: false },
                      ].map(({ label, done }, i, arr) => (
                        <React.Fragment key={label}>
                          <View style={resignSt.step}>
                            <View style={[resignSt.dot, done ? resignSt.dotDone : resignSt.dotPending]}>
                              {done
                                ? <MaterialCommunityIcons name="check" size={9} color="#fff" />
                                : <View style={resignSt.dotInner} />}
                            </View>
                            <Text style={[resignSt.stepLabel, done && resignSt.stepLabelDone]}>{label}</Text>
                          </View>
                          {i < arr.length - 1 && (
                            <View style={[resignSt.line, done ? resignSt.lineDone : resignSt.linePending]} />
                          )}
                        </React.Fragment>
                      ))}
                    </View>
                  </View>
                </View>
              ) : resignation?.status === 'rejected' ? (
                <>
                  <View style={styles.actionRow}>
                    <View style={[styles.actionIcon, { backgroundColor: Colors.badgeRedBg }]}>
                      <MaterialCommunityIcons name="close-circle-outline" size={20} color={Colors.statusRed} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.actionLabel, { color: Colors.statusRed }]}>Resignation Rejected</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                        {resignation.rejectedBy === 'dept_head' ? 'Rejected by Dept Head' : 'Rejected by HR'}
                        {resignation.hrComment ? ` · "${resignation.hrComment}"` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actionDivider} />
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => router.push('/resignation/warning')}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: Colors.badgeRedBg }]}>
                      <MaterialCommunityIcons name="file-refresh-outline" size={20} color={Colors.statusRed} />
                    </View>
                    <Text style={[styles.actionLabel, { color: Colors.statusRed }]}>Resubmit Resignation</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.statusRed} />
                  </TouchableOpacity>
                </>
              ) : !resignation ? (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => router.push('/resignation/warning')}
                  activeOpacity={0.75}
                >
                  <View style={[styles.actionIcon, { backgroundColor: Colors.badgeRedBg }]}>
                    <MaterialCommunityIcons name="file-sign" size={20} color={Colors.statusRed} />
                  </View>
                  <Text style={[styles.actionLabel, { color: Colors.statusRed }]}>Submit Resignation</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.statusRed} />
                </TouchableOpacity>
              ) : null}

              <View style={styles.actionDivider} />

              <TouchableOpacity style={[styles.actionRow, styles.logoutRow]} onPress={handleLogout}>
                <View style={[styles.actionIcon, { backgroundColor: Colors.badgeRedBg }]}>
                  <MaterialCommunityIcons name="logout" size={20} color={Colors.statusRed} />
                </View>
                <Text style={[styles.actionLabel, { color: Colors.statusRed }]}>Logout</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.statusRed} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </Animated.ScrollView>

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} onLogout={handleLogout} />

      <BottomSheet visible={showPwd} onClose={() => setShowPwd(false)} title="Change Password">
        <Controller
          control={control}
          name="identifier"
          render={({ field: { value } }) => (
            <Input
              label="Employee Code"
              value={value}
              editable={false}
              error={errors.identifier?.message}
              leftIconName="badge-account-outline"
              containerStyle={{ opacity: 0.6 }}
            />
          )}
        />
        <Controller
          control={control}
          name="newPassword"
          render={({ field: { onChange, value, onBlur } }) => (
            <Input
              label="New Password"
              placeholder="Minimum 8 characters"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              isPassword
              error={errors.newPassword?.message}
              leftIconName="lock-outline"
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value, onBlur } }) => (
            <Input
              label="Confirm Password"
              placeholder="Re-enter new password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              isPassword
              error={errors.confirmPassword?.message}
              leftIconName="lock-check-outline"
            />
          )}
        />
        <Button title="Update Password" onPress={handleSubmit(handleChangePwd)} loading={pwdLoading} />
      </BottomSheet>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  content: { paddingBottom: 40 },

  heroCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: BorderRadius.xxl,
    padding: 24,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 6, height: 10 }, shadowOpacity: 0.25, shadowRadius: 18 },
      android: { elevation: 10 },
    }),
  },
  heroTopRow: { width: '100%', alignItems: 'flex-start', marginBottom: 4 },
  heroDeco1: {
    position: 'absolute', top: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroDeco2: {
    position: 'absolute', bottom: -20, left: -10,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  avatarWrap: {
    marginBottom: 8,
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#006496',
  },
  empName: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  empSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center' },
  heroBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  typeChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  deptChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  deptText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.09, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  statValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },

  actionsWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  logoutRow: {},
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: Colors.outlineVariant, marginHorizontal: 16 },
});

const resignSt = StyleSheet.create({
  steps: { flexDirection: 'row', alignItems: 'center' },
  step: { alignItems: 'center', gap: 3 },
  dot: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: Colors.statusGreen },
  dotPending: { backgroundColor: Colors.outlineVariant, borderWidth: 1.5, borderColor: Colors.border },
  dotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  stepLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },
  stepLabelDone: { color: Colors.statusGreen },
  line: { flex: 1, height: 2, marginBottom: 12 },
  lineDone: { backgroundColor: Colors.statusGreen },
  linePending: { backgroundColor: Colors.outlineVariant },
});
