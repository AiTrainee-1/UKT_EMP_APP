import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import { ProfileSection } from '../../src/components/ProfileSection';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';
import api from '../../src/lib/api';

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
  const { user, logout } = useAuth();
  const { data: emp, isLoading } = useEmployee(user?.employeeId ?? null);
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
      await api.post('/auth/set-password', { identifier: data.identifier, password: data.newPassword });
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <View style={styles.avatar}>
                <Text style={styles.initials}>
                  {emp?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'EM'}
                </Text>
              </View>
              <Text style={styles.empName}>{emp?.name}</Text>
              <Text style={styles.empCode}>{emp?.employeeCode} · {emp?.designation}</Text>
              <View style={{ marginTop: 6 }}>
                <Badge label={emp?.status || 'Active'} variant="present" />
              </View>
            </View>

            {/* Sections */}
            <ProfileSection
              title="Personal Information"
              icon="account-outline"
              defaultOpen
              rows={[
                { label: 'Full Name', value: emp?.name || '' },
                { label: 'Date of Birth', value: emp?.dateOfBirth || '' },
                { label: 'Gender', value: emp?.gender || '' },
                { label: 'Email', value: emp?.email || '' },
                { label: 'Phone', value: emp?.phone || '' },
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
              title="Employment Details"
              icon="briefcase-outline"
              rows={[
                { label: 'Employee Code', value: emp?.employeeCode || '' },
                { label: 'Employment Type', value: emp?.employmentType || '' },
                { label: 'Join Date', value: emp?.joinDate || '' },
                { label: 'Department', value: emp?.department || '' },
                { label: 'Designation', value: emp?.designation || '' },
              ]}
            />

            <ProfileSection
              title="Bank Details"
              icon="bank-outline"
              rows={[
                { label: 'Bank Name', value: emp?.bankName || '' },
                { label: 'Account Number', value: maskAccount(emp?.accountNumber || '') },
                { label: 'IFSC Code', value: emp?.ifscCode || '' },
              ]}
            />

            <ProfileSection
              title="Compliance"
              icon="shield-check-outline"
              rows={[
                { label: 'PF Number', value: emp?.pfNumber || '' },
                { label: 'ESI Number', value: emp?.esiNumber || '' },
                { label: 'UAN Number', value: emp?.uanNumber || '' },
              ]}
            />

            <ProfileSection
              title="Address"
              icon="map-marker-outline"
              rows={[
                { label: 'Address', value: emp?.address || '' },
              ]}
            />

            {/* Actions */}
            <Button
              title="Change Password"
              variant="outline"
              onPress={() => setShowPwd(true)}
              style={styles.actionBtn}
            />
            <Button
              title="Logout"
              variant="ghost"
              onPress={handleLogout}
              textStyle={{ color: Colors.statusRed }}
              style={styles.logoutBtn}
            />
          </>
        )}
      </ScrollView>

      {/* Change Password Sheet */}
      <BottomSheet visible={showPwd} onClose={() => setShowPwd(false)} title="Change Password">
        <Controller
          control={control}
          name="identifier"
          render={({ field: { onChange, value, onBlur } }) => (
            <Input
              label="Employee Code"
              placeholder="Your employee code"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="numeric"
              error={errors.identifier?.message}
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
            />
          )}
        />
        <Button
          title="Update Password"
          onPress={handleSubmit(handleChangePwd)}
          loading={pwdLoading}
        />
      </BottomSheet>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  header: { padding: 16, paddingTop: 8 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  initials: { color: '#fff', fontSize: 28, fontWeight: '800' },
  empName: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  empCode: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  actionBtn: { marginTop: 16 },
  logoutBtn: { marginTop: 8 },
});
