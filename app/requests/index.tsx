import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions, useSubmitPermission } from '../../src/hooks/useRequests';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { DatePickerField, TimePickerField } from '../../src/components/ui/DatePickerField';
import { Colors } from '../../src/constants/colors';

const PERMISSION_TYPES = ['Early Out', 'Late In', 'Short Leave'];
const todayStr = format(new Date(), 'yyyy-MM-dd');

const schema = z.object({
  type: z.string().min(1, 'Select a type'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)'),
});
type FormData = z.infer<typeof schema>;

export default function RequestsScreen() {
  const { user } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data, isLoading, refetch, isRefetching } = usePermissions(user?.employeeId ?? null);
  const submit = useSubmitPermission(user?.employeeId ?? null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: '', date: todayStr, time: '09:30', reason: '' },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (formData: FormData) => {
    try {
      await submit.mutateAsync(formData);
      showToast('Request submitted successfully!', 'success');
      setShowNew(false);
      reset({ type: '', date: todayStr, time: '09:30', reason: '' });
    } catch {
      showToast('Failed to submit. Please try again.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={data || []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !(data?.length) && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View>{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState icon="hand-pointing-right" title="No permission requests" subtitle="Your permission requests will appear here" />
          )
        }
        renderItem={({ item }) => {
          const variant = item.status === 'Approved' ? 'approved' : item.status === 'Rejected' ? 'rejected' : 'pending';
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.type}>{item.type}</Text>
                <Badge label={item.status} variant={variant} />
              </View>
              <Text style={styles.dateTime}>
                {format(new Date(item.date), 'dd MMM yyyy')} · {item.time}
              </Text>
              {item.reason && <Text style={styles.reason}>{item.reason}</Text>}
            </View>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* New Request Sheet */}
      <BottomSheet visible={showNew} onClose={() => { setShowNew(false); reset(); }} title="New Permission Request">
        <Text style={styles.fieldLabel}>Request Type</Text>
        <Controller
          control={control}
          name="type"
          render={({ field: { onChange, value } }) => (
            <View style={styles.typeRow}>
              {PERMISSION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, value === t && styles.chipActive]}
                  onPress={() => onChange(t)}
                >
                  <Text style={[styles.chipText, value === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
        {errors.type && <Text style={styles.errorText}>{errors.type.message}</Text>}

        <Controller
          control={control}
          name="date"
          render={({ field: { onChange, value } }) => (
            <DatePickerField label="Date" value={value} onChange={onChange} error={errors.date?.message} />
          )}
        />

        <Controller
          control={control}
          name="time"
          render={({ field: { onChange, value } }) => (
            <TimePickerField label="Time" value={value} onChange={onChange} error={errors.time?.message} />
          )}
        />

        <Controller
          control={control}
          name="reason"
          render={({ field: { onChange, value, onBlur } }) => (
            <Input
              label="Reason"
              placeholder="Describe your reason..."
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              numberOfLines={3}
              error={errors.reason?.message}
              style={{ minHeight: 80, textAlignVertical: 'top' } as any}
            />
          )}
        />

        <Button title="Submit Request" onPress={handleSubmit(onSubmit)} loading={submit.isPending} />
      </BottomSheet>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  pad: { padding: 16, paddingBottom: 100 },
  center: { flex: 1 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  dateTime: { color: Colors.textMuted, fontSize: 13 },
  reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}22` },
  chipText: { color: Colors.textMuted, fontSize: 13 },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },
  errorText: { color: Colors.statusRed, fontSize: 12, marginBottom: 8 },
});
