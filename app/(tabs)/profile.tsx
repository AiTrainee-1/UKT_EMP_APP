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
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { APP_VERSION } from '../../src/lib/appVersion';
import { useAuth, setPasswordRequest } from '../../src/hooks/useAuth';
import { useEmployee, statusLabel } from '../../src/hooks/useEmployee';
import { useShift } from '../../src/hooks/useShift';
import { useFamily, RELATION_LABEL } from '../../src/hooks/useFamily';
import { useLocalProfilePhoto } from '../../src/hooks/useLocalProfilePhoto';
import { useMyResignation } from '../../src/hooks/useResignation';
import { trailRows, trailWorthShowing, waitingTarget } from '../../src/lib/approval';
import { ExpandableCard, DetailBox, DetailRow } from '../../src/components/ui/ExpandableCard';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Avatar } from '../../src/components/ui/Avatar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

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

function maskAccount(acc?: string | null) {
  if (!acc || acc.length < 4) return acc || '—';
  return '*'.repeat(acc.length - 4) + acc.slice(-4);
}

function calcAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.floor(years);
}

function passwordAgeLabel(iso?: string | null): string {
  if (!iso) return 'Never changed';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never changed';
  const days = Math.floor((Date.now() - then) / (24 * 3600 * 1000));
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Last updated 1 day ago';
  return `Last updated ${days} days ago`;
}

function extractPhone(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/[+\d][\d\s-]{6,}/);
  if (!match) return null;
  return match[0].replace(/[\s-]/g, '');
}

export default function ProfileScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user, logout } = useAuth();
  const { data: emp, isLoading } = useEmployee(user?.employeeId ?? null);
  const { data: shift } = useShift(user?.employeeId ?? null);
  const { data: dependents } = useFamily(user?.employeeId ?? null);
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

  const resignationSubtitle = () => {
    if (!resignation) return 'View resignation & notice details';
    // Who it waits for comes from the request itself (HR's pipeline decides). The status names below are only what an
    // older backend, whose two stages are fixed, has to go on.
    const waitingFor = resignation.status === 'pending' || resignation.status === 'dept_approved'
      ? waitingTarget(resignation.approval)
      : null;
    if (waitingFor) return `Pending — waiting for ${waitingFor}`;
    if (resignation.status === 'pending') return 'Pending — awaiting Dept Head';
    if (resignation.status === 'dept_approved') return 'Pending — awaiting HR';
    if (resignation.status === 'approved') return 'Resignation approved';
    if (resignation.status === 'rejected') return 'Rejected — tap to resubmit';
    return 'View resignation & notice details';
  };

  const handleResignationPress = () => {
    if (!resignation || resignation.status === 'rejected') {
      router.push('/resignation/warning');
      return;
    }
    // An alert holds text only, so the step trail goes in as lines: "Department Head: Approved by Anitha · 12 Mar, 4:30 PM".
    const trail = trailWorthShowing(resignation.approval)
      ? '\n\n' + trailRows(resignation.approval).map((r) => `${r.role}: ${r.text}`).join('\n')
      : '';
    Alert.alert(
      'Resignation & Exit',
      resignationSubtitle() + trail + (resignation.hrComment ? `\n\n"${resignation.hrComment}"` : ''),
    );
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const HERO_HEIGHT = 230;
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, HERO_HEIGHT],
    outputRange: [50, 0, -HERO_HEIGHT * 0.35],
    extrapolateRight: 'clamp',
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: 'clamp',
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

  const age = calcAge(emp?.dateOfBirth);
  const emergencyPhone = extractPhone(emp?.emergencyContact);
  const shiftTag = shift ? `Shift ${shift.shiftName} (${shift.startTime} - ${shift.endTime})` : null;
  const isTerminalStatus = emp?.status?.toLowerCase() === 'active' || !emp?.status;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

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
            {/* Hero card — parallax: shrinks/slides on scroll */}
            <Animated.View style={{ transform: [{ translateY: heroTranslateY }, { scale: heroScale }] }}>
              <LinearGradient
                colors={Colors.gradientRoyal}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={styles.heroDeco1} />
                <View style={styles.heroDeco2} />

                <View style={styles.heroTopRow}>
                  <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color="#fff" size={20} />
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={[styles.dutyBadge, !isTerminalStatus && { backgroundColor: 'rgba(251,191,36,0.25)' }]}>
                      <View style={[styles.dutyDot, !isTerminalStatus && { backgroundColor: Colors.statusYellow }]} />
                      <Text style={styles.dutyText}>{statusLabel(emp?.status)}</Text>
                    </View>
                    <Text style={styles.rollText}>ROLL #{emp?.employeeCode}</Text>
                  </View>
                </View>

                <View style={styles.heroBody}>
                  <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.85} disabled={savingPhoto}>
                    <Avatar
                      uri={localPhoto.photo ?? emp?.photoUrl}
                      name={emp?.name}
                      size={64}
                      borderColor="rgba(255,255,255,0.5)"
                    />
                    <View style={styles.avatarEditBadge}>
                      {savingPhoto ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <MaterialCommunityIcons name="camera" size={12} color={Colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.empName} numberOfLines={1}>{emp?.name}</Text>
                      {emp?.hasPassword && (
                        <MaterialCommunityIcons name="check-decagram" size={16} color="#60A5FA" />
                      )}
                    </View>
                    <Text style={styles.empSub} numberOfLines={1}>
                      {[emp?.designationTitle, emp?.role || emp?.departmentName].filter(Boolean).join(' • ')}
                    </Text>
                    {(emp?.departmentName || emp?.branchName) && (
                      <View style={styles.plantRow}>
                        <MaterialCommunityIcons name="domain" size={12} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.plantText} numberOfLines={1}>
                          {[emp?.departmentName, emp?.branchName].filter(Boolean).join(' • ')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {!!(emp?.staffTier || shiftTag || emp?.zone) && (
                  <View style={styles.tagRow}>
                    {emp?.staffTier && (
                      <View style={styles.tag}><Text style={styles.tagText}>{emp.staffTier}</Text></View>
                    )}
                    {shiftTag && (
                      <View style={styles.tag}><Text style={styles.tagText}>{shiftTag}</Text></View>
                    )}
                    {emp?.zone && (
                      <View style={styles.tag}><Text style={styles.tagText}>Zone {emp.zone}</Text></View>
                    )}
                  </View>
                )}
              </LinearGradient>
            </Animated.View>

            {/* Digital ID Pass quick-link */}
            <TouchableOpacity style={styles.idLinkCard} onPress={() => router.push('/idcard')} activeOpacity={0.85}>
              <View style={styles.idLinkIcon}>
                <MaterialCommunityIcons name="card-account-details-outline" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.idLinkTitle}>Digital ID Pass</Text>
                  <View style={styles.nfcBadge}>
                    <Text style={styles.nfcBadgeText}>NFC ACTIVE</Text>
                  </View>
                </View>
                <Text style={styles.idLinkSub} numberOfLines={1}>Verified biometric pass &amp; terminal QR</Text>
              </View>
              <MaterialCommunityIcons name="arrow-right" size={18} color={Colors.primary} />
            </TouchableOpacity>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {[
                { label: 'Work Contact', value: emp?.phone || '—', icon: 'phone-outline' },
                { label: 'Join Date', value: emp?.joinDate || '—', icon: 'calendar-outline' },
                { label: 'Workstation', value: emp?.workstation || '—', icon: 'clock-outline' },
              ].map(({ label, value, icon }) => (
                <View key={label} style={styles.statCard}>
                  <MaterialCommunityIcons name={icon as any} size={18} color={Colors.primary} />
                  <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Personal Details */}
            <ExpandableCard icon="account-outline" title="Personal Details" subtitle="Primary identity & contact verification" defaultOpen>
              <DetailRow>
                <DetailBox label="Legal Full Name" value={emp?.name} />
                <DetailBox label="Gender • Blood Group" value={[emp?.gender, emp?.bloodGroup].filter(Boolean).join(' • ')} />
              </DetailRow>
              <DetailRow>
                <DetailBox label="Date of Birth" value={emp?.dateOfBirth ? `${emp.dateOfBirth}${age != null ? ` (${age}y)` : ''}` : undefined} />
                <DetailBox label="Nationality" value={emp?.nationality} />
              </DetailRow>
              <DetailBox
                label="Official Corporate Email"
                value={emp?.email}
                accessory={emp?.email ? (
                  <View style={styles.verifiedBadge}>
                    <MaterialCommunityIcons name="check-circle" size={12} color={Colors.statusGreen} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                ) : undefined}
              />
              <DetailBox
                label="Emergency ICE Contact"
                value={emp?.emergencyContact}
                accessory={emergencyPhone ? (
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${emergencyPhone}`)}
                    activeOpacity={0.75}
                  >
                    <MaterialCommunityIcons name="phone" size={14} color="#fff" />
                  </TouchableOpacity>
                ) : undefined}
              />
            </ExpandableCard>

            {/* Family & Dependents */}
            <ExpandableCard
              icon="account-group-outline"
              title="Family & Dependents"
              subtitle="Health scheme & insurance nominees"
              badgeLabel={dependents ? `${dependents.length} Member${dependents.length === 1 ? '' : 's'}` : undefined}
            >
              {dependents && dependents.length > 0 ? (
                dependents.map((d) => (
                  <View key={d.id} style={styles.dependentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dependentName}>{d.name}</Text>
                      <Text style={styles.dependentRelation}>{RELATION_LABEL[d.relation]}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {d.isInsuranceNominee && (
                        <View style={styles.miniBadge}><Text style={styles.miniBadgeText}>Nominee</Text></View>
                      )}
                      {d.coveredUnderHealthScheme && (
                        <View style={[styles.miniBadge, { backgroundColor: Colors.badgeGreenBg }]}>
                          <Text style={[styles.miniBadgeText, { color: Colors.badgeGreenText }]}>Health</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No dependents on file.</Text>
              )}
            </ExpandableCard>

            {/* Employment & Hierarchy */}
            <ExpandableCard
              icon="office-building-outline"
              title="Employment & Hierarchy"
              subtitle="Division, shift rules & supervisors"
              badgeLabel={emp?.isConfirmed ? 'Confirmed' : 'On Probation'}
              badgeBg={emp?.isConfirmed ? Colors.badgeGreenBg : Colors.badgeYellowBg}
              badgeColor={emp?.isConfirmed ? Colors.badgeGreenText : Colors.badgeYellowText}
            >
              <DetailBox label="Division" value={emp?.departmentName} />
              <DetailBox label="Shift Rules" value={shift ? `${shift.shiftName} (${shift.startTime} - ${shift.endTime})` : undefined} />
              <DetailBox
                label="Supervisor"
                value={emp?.reportingManager ? [emp.reportingManager.name, emp.reportingManager.designationTitle].filter(Boolean).join(' • ') : 'Not assigned'}
              />
            </ExpandableCard>

            {/* Bank & Compliance */}
            <ExpandableCard icon="bank-outline" title="Bank & Compliance" subtitle="Payroll dispersal & PF identifiers" rightIcon="lock-outline">
              <DetailRow>
                <DetailBox label="Bank Name" value={emp?.bankName} />
                <DetailBox label="IFSC Code" value={emp?.bankIfsc} />
              </DetailRow>
              <DetailBox label="Account Number" value={maskAccount(emp?.bankAccount)} />
              <DetailRow>
                <DetailBox label="PF Number" value={emp?.pfNumber} />
                <DetailBox label="ESI Number" value={emp?.esiNumber} />
              </DetailRow>
              <DetailBox label="UAN Number" value={emp?.uanNumber} />
            </ExpandableCard>

            {/* Security & Account */}
            <Text style={styles.sectionLabel}>SECURITY & ACCOUNT</Text>
            <View style={styles.actionsWrap}>
              <TouchableOpacity style={styles.actionRow} onPress={() => setShowPwd(true)} activeOpacity={0.75}>
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons name="key-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionLabel}>Change Portal Password</Text>
                  <Text style={styles.actionSub}>{passwordAgeLabel(emp?.passwordUpdatedAt)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              {/* '/help' is cast because the typed-routes file is only regenerated by the dev server. */}
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => router.push('/help' as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Help and Support"
              >
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons name="lifebuoy" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionLabel}>Help & Support</Text>
                  <Text style={styles.actionSub}>Contact HR or software support</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              <TouchableOpacity style={styles.actionRow} onPress={handleResignationPress} activeOpacity={0.75}>
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons name="file-account-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionLabel}>Resignation & Exit</Text>
                  <Text style={styles.actionSub}>{resignationSubtitle()}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.85}>
              <MaterialCommunityIcons name="logout" size={18} color={Colors.statusRed} />
              <Text style={styles.signOutText}>Sign Out of UKTextiles</Text>
            </TouchableOpacity>

            <Text style={styles.versionText}>UKTextiles Enterprise Mobile Platform</Text>
            <Text style={styles.versionText}>Version {APP_VERSION}</Text>
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
    padding: 20,
    gap: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15 },
      android: { elevation: 10 },
    }),
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
  dutyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(52,211,153,0.2)',
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  dutyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.statusGreen },
  dutyText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  rollText: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 5 },

  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empName: { color: '#fff', fontFamily: FontFamily.headlineSemibold, fontSize: 19, flexShrink: 1 },
  empSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 2 },
  plantRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  plantText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, flexShrink: 1 },

  tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  tagText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  idLinkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
  },
  idLinkIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  idLinkTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  idLinkSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  nfcBadge: { backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  nfcBadgeText: { color: Colors.badgeBlueText, fontSize: 9, fontWeight: '800' },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  statValue: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5, textAlign: 'center' },
  statLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '600' },

  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  verifiedText: { color: Colors.statusGreen, fontSize: 10.5, fontWeight: '700' },
  callBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },

  dependentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  dependentName: { color: Colors.textPrimary, fontSize: 13, fontFamily: FontFamily.bodySemibold },
  dependentRelation: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  miniBadge: { backgroundColor: Colors.badgeLeaveBg, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  miniBadgeText: { color: Colors.badgeLeaveText, fontSize: 9.5, fontWeight: '700' },
  emptyText: { color: Colors.textMuted, fontSize: 12.5, textAlign: 'center', paddingVertical: 6 },

  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    marginHorizontal: 16, marginTop: 4, marginBottom: 8,
  },
  actionsWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: Colors.textPrimary, fontSize: 14.5, fontFamily: FontFamily.bodySemibold },
  actionSub: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  actionDivider: { height: 1, backgroundColor: Colors.outlineVariant, marginHorizontal: 16 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16,
    backgroundColor: Colors.badgeRedBg,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
  },
  signOutText: { color: Colors.statusRed, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },

  versionText: { textAlign: 'center', color: Colors.textMuted, fontSize: 10.5, marginTop: 10 },
});
