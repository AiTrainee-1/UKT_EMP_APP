import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Pressable,
  Alert,
  Platform,
  Linking,
  ScrollView,
  Switch,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { APP_VERSION } from '../../src/lib/appVersion';
import { useAuth, setPasswordRequest } from '../../src/hooks/useAuth';
import { useConfirmSignOut } from '../../src/hooks/useSignOut';
import { useEmployee, statusLabel } from '../../src/hooks/useEmployee';
import { useShift } from '../../src/hooks/useShift';
import { useFamily, RELATION_LABEL } from '../../src/hooks/useFamily';
import { useLocalProfilePhoto } from '../../src/hooks/useLocalProfilePhoto';
import { useMyResignation } from '../../src/hooks/useResignation';
import { useRouteRequest } from '../../src/hooks/useFocusItem';
import { readWordParam } from '../../src/lib/focusItem';
import { useReduceMotion } from '../../src/lib/motionPrefs';
import {
  calcAge,
  capitalize,
  displayDate,
  employmentTypeLabel,
  extractPhone,
  initialsOf,
  maskAccount,
  passwordAgeLabel,
  serviceLength,
} from '../../src/lib/profileView';
import { FocusFrame } from '../../src/components/focus/FocusFrame';
import { trailRows, trailWorthShowing, waitingTarget } from '../../src/lib/approval';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Reveal } from '../../src/components/Reveal';
import { ThemedStatusBar } from '../../src/components/ThemedStatusBar';
import { ProfileHero } from '../../src/components/profile/ProfileHero';
import {
  InfoPair,
  InfoRow,
  RowAction,
  SectionCard,
  SettingsRow,
  StatChip,
  cardShadow,
} from '../../src/components/profile/ProfileParts';
import { requestAppTourReplay } from '../../src/components/home/HomeTour';
import { VoiceGreetingSettingsRow } from '../../src/components/transitions/VoiceGreetingSetting';
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

// The compact title in the top bar takes over from the hero once it has scrolled this far.
const COMPACT_AT = 200;

/**
 * My Profile (owner 2026-11-25 redesign): a hero with the photo (change / remove it on this phone), name, role, status
 * and code; quick chips (service, shift, type, confirmation, tier, zone); the Digital ID; the record grouped as Personal,
 * Contact, Employment, Family and Bank & IDs; then Settings (dark mode, password, replay the app tour, help, resignation)
 * and Logout. Everything the page showed and did before is still here.
 */
export default function ProfileScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors, isDark, mode, setMode, toggle: toggleTheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();

  const { user } = useAuth();
  const { data: emp, isLoading } = useEmployee(user?.employeeId ?? null);
  const { data: shift } = useShift(user?.employeeId ?? null);
  const { data: dependents } = useFamily(user?.employeeId ?? null);
  const { data: resignation, refetch: refetchResignation } = useMyResignation(user?.employeeId ?? null);
  // A notification about the employee's resignation opens this tab with ?section=resignation (src/lib/notificationTarget.ts):
  // ask the server where it stands, scroll to the "Resignation & Exit" row (which says so; a tap shows the details) and pulse
  // it once.
  const sectionRequest = useRouteRequest('section', readWordParam);
  const resignationFocus = sectionRequest?.value === 'resignation' ? sectionRequest.nonce : 0;
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (resignationFocus) void refetchResignation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resignationFocus]);
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

  // Refused while an On-Duty day is running (src/hooks/useSignOut.ts).
  const handleLogout = useConfirmSignOut();

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

  // Scroll-linked motion on the native driver: the hero drifts up a little slower than the page, and the top bar's
  // compact name fades in once the hero has gone. Reduce Motion keeps the hero still (the title still swaps).
  const scrollY = useRef(new Animated.Value(0)).current;
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 300],
    outputRange: [0, 0, 60],
    extrapolate: 'clamp',
  });
  const heroOpacity = scrollY.interpolate({ inputRange: [0, 260], outputRange: [1, 0.35], extrapolate: 'clamp' });
  const compactOpacity = scrollY.interpolate({ inputRange: [COMPACT_AT - 40, COMPACT_AT], outputRange: [0, 1], extrapolate: 'clamp' });
  const titleOpacity = scrollY.interpolate({ inputRange: [COMPACT_AT - 40, COMPACT_AT], outputRange: [1, 0], extrapolate: 'clamp' });

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

  const replayTour = () => {
    requestAppTourReplay();
    router.navigate('/(tabs)/home');
  };

  const age = calcAge(emp?.dateOfBirth);
  const emergencyPhone = extractPhone(emp?.emergencyContact);
  const workPhone = extractPhone(emp?.phone);
  const shiftTimes = shift ? `${shift.startTime} - ${shift.endTime}` : null;
  const shiftRules = shift ? `${shift.shiftName} (${shift.startTime} - ${shift.endTime})` : undefined;
  const isActiveStatus = emp?.status?.toLowerCase() === 'active' || !emp?.status;
  const tenure = serviceLength(emp?.joinDate);
  const photoUri = localPhoto.photo ?? emp?.photoUrl ?? null;
  const confirmedBadge = emp
    ? emp.isConfirmed
      ? { label: 'Confirmed', bg: Colors.badgeGreenBg, fg: Colors.badgeGreenText }
      : { label: 'On Probation', bg: Colors.badgeYellowBg, fg: Colors.badgeYellowText }
    : undefined;

  const chips = [
    emp?.joinDate ? { key: 'joined', icon: 'calendar-star', label: tenure ? `JOINED · ${tenure.toUpperCase()}` : 'JOINED', value: displayDate(emp.joinDate) } : null,
    // "SHIFT", not the shift's (long) name: that pushed the chip past the screen edge; the name is in Employment below.
    shiftTimes ? { key: 'shift', icon: 'clock-outline', label: 'SHIFT', value: shiftTimes } : null,
    emp?.employmentType ? { key: 'type', icon: 'account-hard-hat-outline', label: 'TYPE', value: employmentTypeLabel(emp.employmentType) ?? '' } : null,
    emp?.staffTier ? { key: 'tier', icon: 'star-four-points-outline', label: 'TIER', value: emp.staffTier } : null,
    emp?.zone ? { key: 'zone', icon: 'map-marker-outline', label: 'ZONE', value: `Zone ${emp.zone}` } : null,
  ].filter(Boolean) as { key: string; icon: string; label: string; value: string }[];

  let section = 0;
  const next = () => section++;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* The page under the status bar is the page background (the hero card starts below the top bar). */}
      <ThemedStatusBar />

      {/* ─── Top bar: menu · title (becomes the name once the hero scrolls away) · Digital ID ─── */}
      <View style={styles.topBar}>
        <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen((v) => !v)} color={Colors.textPrimary} size={20} />
        <View style={styles.titleSlot}>
          <Animated.Text style={[styles.topTitle, { opacity: titleOpacity }]} numberOfLines={1}>
            My Profile
          </Animated.Text>
          <Animated.View style={[styles.compact, { opacity: compactOpacity }]} pointerEvents="none">
            <View style={styles.compactAvatar}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.compactPhoto} accessibilityIgnoresInvertColors />
              ) : (
                <Text style={styles.compactInitials}>{initialsOf(emp?.name)}</Text>
              )}
            </View>
            <Text style={styles.compactName} numberOfLines={1}>{emp?.name ?? ''}</Text>
          </Animated.View>
        </View>
        <Pressable
          onPress={() => router.push('/idcard')}
          style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Digital ID Card"
          hitSlop={6}
        >
          <MaterialCommunityIcons name="qrcode" size={19} color={Colors.primaryLight} />
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {isLoading ? (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <View style={styles.skeletonHero}>
              <Skeleton width={96} height={96} borderRadius={48} />
              <Skeleton width="55%" height={20} />
              <Skeleton width="40%" height={12} />
            </View>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={styles.skeletonCard}>
                <Skeleton width="45%" height={16} />
                <Skeleton width="100%" height={12} />
                <Skeleton width="80%" height={12} />
              </View>
            ))}
          </View>
        ) : (
          <>
            {/* ─── Hero ─── */}
            <Animated.View style={reduce ? undefined : { transform: [{ translateY: heroTranslateY }], opacity: heroOpacity }}>
              <ProfileHero
                name={emp?.name}
                photoUri={photoUri}
                verified={!!emp?.hasPassword}
                roleLine={[emp?.designationTitle, emp?.role || emp?.departmentName].filter(Boolean).join(' • ')}
                placeLine={[emp?.departmentName, emp?.branchName].filter(Boolean).join(' • ')}
                statusText={statusLabel(emp?.status)}
                statusActive={isActiveStatus}
                code={emp?.employeeCode}
                savingPhoto={savingPhoto}
                onPickPhoto={handlePickPhoto}
                hasLocalPhoto={!!localPhoto.photo}
              />
            </Animated.View>

            {/* ─── Quick chips ─── */}
            {chips.length > 0 && (
              <Reveal index={next()} offsetY={8}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                >
                  {chips.map((c) => (
                    <StatChip key={c.key} icon={c.icon} label={c.label} value={c.value} />
                  ))}
                </ScrollView>
              </Reveal>
            )}

            {/* ─── Digital ID ─── */}
            <Reveal index={next()} offsetY={8}>
              <Pressable
                style={({ pressed }) => [styles.idCard, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}
                onPress={() => router.push('/idcard')}
                accessibilityRole="button"
                accessibilityLabel="Digital ID Pass. Verified pass and gate QR"
              >
                <View style={styles.idIcon}>
                  <MaterialCommunityIcons name="card-account-details-outline" size={22} color={Colors.onPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.idTitle}>Digital ID Pass</Text>
                    <View style={styles.nfcBadge}>
                      <Text style={styles.nfcBadgeText}>NFC ACTIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.idSub} numberOfLines={1}>Verified biometric pass &amp; terminal QR</Text>
                </View>
                <View style={styles.idArrow}>
                  <MaterialCommunityIcons name="arrow-right" size={18} color={Colors.primaryLight} />
                </View>
              </Pressable>
            </Reveal>

            {/* ─── Personal ─── */}
            <Reveal index={next()} offsetY={8}>
              <SectionCard icon="account-outline" title="Personal details" subtitle="Primary identity">
                <InfoRow icon="card-account-details-outline" label="Legal full name" value={emp?.name} />
                <InfoPair
                  left={{ icon: 'gender-male-female', label: 'Gender', value: capitalize(emp?.gender) }}
                  right={{ icon: 'water-outline', label: 'Blood group', value: emp?.bloodGroup }}
                />
                <InfoPair
                  left={{
                    icon: 'cake-variant-outline',
                    label: 'Date of birth',
                    value: emp?.dateOfBirth ? `${displayDate(emp.dateOfBirth)}${age != null ? ` (${age}y)` : ''}` : null,
                  }}
                  right={{ icon: 'flag-outline', label: 'Nationality', value: emp?.nationality }}
                  last
                />
              </SectionCard>
            </Reveal>

            {/* ─── Contact ─── */}
            <Reveal index={next()} offsetY={8}>
              <SectionCard icon="card-account-phone-outline" title="Contact" subtitle="How the company reaches you">
                <InfoRow
                  icon="phone-outline"
                  label="Work contact"
                  value={emp?.phone}
                  accessory={workPhone ? (
                    <RowAction icon="phone" label="Call work contact" onPress={() => Linking.openURL(`tel:${workPhone}`)} />
                  ) : undefined}
                />
                <InfoRow
                  icon="email-outline"
                  label="Official corporate email"
                  value={emp?.email}
                  accessory={emp?.email ? (
                    <View style={styles.verifiedBadge}>
                      <MaterialCommunityIcons name="check-circle" size={13} color={Colors.statusGreen} />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  ) : undefined}
                />
                <InfoRow
                  icon="alarm-light-outline"
                  label="Emergency (ICE) contact"
                  value={emp?.emergencyContact}
                  accessory={emergencyPhone ? (
                    <RowAction icon="phone" label="Call emergency contact" onPress={() => Linking.openURL(`tel:${emergencyPhone}`)} />
                  ) : undefined}
                  last
                />
              </SectionCard>
            </Reveal>

            {/* ─── Employment ─── */}
            <Reveal index={next()} offsetY={8}>
              <SectionCard
                icon="office-building-outline"
                title="Employment & hierarchy"
                subtitle="Division, shift rules & supervisor"
                badge={confirmedBadge}
              >
                <InfoPair
                  left={{ icon: 'pound', label: 'Employee code', value: emp?.employeeCode }}
                  right={{ icon: 'calendar-start', label: 'Join date', value: emp?.joinDate ? displayDate(emp.joinDate) : null }}
                />
                <InfoRow icon="badge-account-horizontal-outline" label="Designation" value={emp?.designationTitle} />
                <InfoRow icon="sitemap-outline" label="Division" value={emp?.departmentName} />
                <InfoPair
                  left={{ icon: 'domain', label: 'Branch', value: emp?.branchName }}
                  right={{ icon: 'desk', label: 'Workstation', value: emp?.workstation }}
                />
                <InfoRow icon="clock-outline" label="Shift rules" value={shiftRules} />
                <InfoRow
                  icon="account-tie-outline"
                  label="Supervisor"
                  value={emp?.reportingManager ? [emp.reportingManager.name, emp.reportingManager.designationTitle].filter(Boolean).join(' • ') : 'Not assigned'}
                  last
                />
              </SectionCard>
            </Reveal>

            {/* ─── Family ─── */}
            <Reveal index={next()} offsetY={8}>
              <SectionCard
                icon="account-group-outline"
                title="Family & dependents"
                subtitle="Health scheme & insurance nominees"
                badge={dependents ? {
                  label: `${dependents.length} Member${dependents.length === 1 ? '' : 's'}`,
                  bg: Colors.badgeLeaveBg,
                  fg: Colors.badgeLeaveText,
                } : undefined}
                collapsible
                defaultOpen={false}
              >
                {dependents && dependents.length > 0 ? (
                  dependents.map((d, i) => (
                    <View key={d.id} style={[styles.dependentRow, i < dependents.length - 1 && styles.dependentDivider]}>
                      <View style={styles.dependentAvatar}>
                        <Text style={styles.dependentInitials}>{initialsOf(d.name)}</Text>
                      </View>
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
              </SectionCard>
            </Reveal>

            {/* ─── Bank & IDs ─── */}
            <Reveal index={next()} offsetY={8}>
              <SectionCard
                icon="bank-outline"
                title="Bank & compliance"
                subtitle="Payroll account & PF identifiers"
                rightIcon="lock-outline"
                collapsible
                defaultOpen={false}
              >
                <InfoPair
                  left={{ icon: 'bank-outline', label: 'Bank name', value: emp?.bankName }}
                  right={{ icon: 'barcode', label: 'IFSC code', value: emp?.bankIfsc }}
                />
                <InfoRow icon="credit-card-outline" label="Account number" value={maskAccount(emp?.bankAccount)} />
                <InfoPair
                  left={{ icon: 'shield-account-outline', label: 'PF number', value: emp?.pfNumber }}
                  right={{ icon: 'medical-bag', label: 'ESI number', value: emp?.esiNumber }}
                />
                <InfoRow icon="identifier" label="UAN number" value={emp?.uanNumber} last />
              </SectionCard>
            </Reveal>

            {/* ─── Settings & account ─── */}
            <Reveal index={next()} offsetY={8}>
              <Text style={styles.groupLabel}>SETTINGS & ACCOUNT</Text>
              <View style={styles.settingsCard}>
                <SettingsRow
                  icon={isDark ? 'weather-night' : 'white-balance-sunny'}
                  label="Dark mode"
                  sub={mode === 'system' ? 'Following your phone' : isDark ? 'On' : 'Off'}
                  tint={isDark ? Colors.statusLeave : Colors.statusYellow}
                  tintBg={isDark ? Colors.badgeLeaveBg : Colors.badgeYellowBg}
                  right={
                    <View style={styles.themeRight}>
                      {mode !== 'system' && (
                        <Pressable
                          onPress={() => setMode('system')}
                          hitSlop={6}
                          style={styles.autoPill}
                          accessibilityRole="button"
                          accessibilityLabel="Follow the phone's setting"
                        >
                          <Text style={styles.autoPillText}>Auto</Text>
                        </Pressable>
                      )}
                      <Switch
                        value={isDark}
                        onValueChange={toggleTheme}
                        trackColor={{ false: Colors.bgSurfaceHighest, true: Colors.primary }}
                        thumbColor={Platform.OS === 'android' ? (isDark ? Colors.primaryLight : '#FFFFFF') : undefined}
                        accessibilityLabel="Dark mode"
                      />
                    </View>
                  }
                />
                {/* "Welcome back, <name>" spoken during the sign-in transition (owner 2026-11-25) */}
                <VoiceGreetingSettingsRow name={user?.name} />
                <SettingsRow
                  icon="key-outline"
                  label="Change portal password"
                  sub={passwordAgeLabel(emp?.passwordUpdatedAt)}
                  onPress={() => setShowPwd(true)}
                />
                <SettingsRow
                  icon="map-marker-path"
                  label="Replay app tour"
                  sub="A walk through every feature of the app"
                  tint={Colors.statusGreen}
                  tintBg={Colors.badgeGreenBg}
                  onPress={replayTour}
                />
                {/* '/help' is cast because the typed-routes file is only regenerated by the dev server. */}
                <SettingsRow
                  icon="lifebuoy"
                  label="Help & Support"
                  sub="Contact HR or software support"
                  onPress={() => router.push('/help' as any)}
                />
                <FocusFrame active={resignationFocus > 0} pulseKey={resignationFocus} scrollRef={scrollRef} radius={BorderRadius.md}>
                  <SettingsRow
                    icon="file-account-outline"
                    label="Resignation & Exit"
                    sub={resignationSubtitle()}
                    tint={Colors.categoryDestructive}
                    tintBg={Colors.badgeRedBg}
                    onPress={handleResignationPress}
                    last
                  />
                </FocusFrame>
              </View>
            </Reveal>

            <Reveal index={next()} offsetY={8}>
              <Pressable
                style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.85 }]}
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel="Sign out of UKTextiles"
              >
                <MaterialCommunityIcons name="logout" size={18} color={Colors.statusRed} />
                <Text style={styles.signOutText}>Sign Out of UKTextiles</Text>
              </Pressable>
            </Reveal>

            <View style={styles.footer}>
              <Text style={styles.versionText}>UKTextiles Enterprise Mobile Platform</Text>
              <Text style={styles.versionText}>Version {APP_VERSION}</Text>
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
  content: { paddingTop: 4, paddingBottom: 40 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  titleSlot: { flex: 1, height: 30, justifyContent: 'center' },
  topTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18, letterSpacing: -0.2 },
  compact: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  compactPhoto: { width: 26, height: 26, borderRadius: 13 },
  compactInitials: { color: Colors.onPrimary, fontSize: 10, fontFamily: FontFamily.displayBold },
  compactName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, flexShrink: 1 },
  topBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },

  skeletonHero: {
    alignItems: 'center', gap: 12, paddingVertical: 28,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xxl, borderWidth: 1, borderColor: Colors.border,
  },
  skeletonCard: {
    gap: 10, padding: 16,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xxl, borderWidth: 1, borderColor: Colors.border,
  },

  chipsRow: { gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },

  idCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    ...cardShadow,
  },
  idIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  idTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  idSub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  idArrow: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  nfcBadge: { backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  nfcBadgeText: { color: Colors.badgeBlueText, fontSize: 9, fontWeight: '800' },

  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  verifiedText: { color: Colors.badgeGreenText, fontSize: 10.5, fontWeight: '700' },

  dependentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dependentDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.outlineVariant },
  dependentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.bgSurfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  dependentInitials: { color: Colors.textSecondary, fontSize: 12, fontFamily: FontFamily.bodySemibold },
  dependentName: { color: Colors.textPrimary, fontSize: 13.5, fontFamily: FontFamily.bodySemibold },
  dependentRelation: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  miniBadge: { backgroundColor: Colors.badgeLeaveBg, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  miniBadgeText: { color: Colors.badgeLeaveText, fontSize: 9.5, fontWeight: '700' },
  emptyText: { color: Colors.textMuted, fontSize: 12.5, textAlign: 'center', paddingVertical: 12 },

  groupLabel: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 8, marginBottom: 8,
  },
  settingsCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  themeRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoPill: {
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  autoPillText: { color: Colors.textSecondary, fontSize: 11, fontFamily: FontFamily.bodySemibold },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16,
    backgroundColor: Colors.badgeRedBg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.clayRed,
    paddingVertical: 14,
  },
  signOutText: { color: Colors.statusRed, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },

  footer: { marginTop: 14, gap: 2 },
  versionText: { textAlign: 'center', color: Colors.textMuted, fontSize: 10.5 },
});
