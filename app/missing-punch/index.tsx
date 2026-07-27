import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useMissingPunch, useSubmitMissingPunch, PUNCH_SLOT_LABEL, type MissingPunchSlot } from '../../src/hooks/useRequests';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { TextArea } from '../../src/components/ui/TextArea';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { DatePickerField, TimePickerField } from '../../src/components/ui/DatePickerField';
import { Colors } from '../../src/constants/colors';
import { BorderRadius, Spacing } from '../../src/constants/theme';

const now = new Date();
const todayStr = format(now, 'yyyy-MM-dd');

const PUNCH_SLOTS: MissingPunchSlot[] = ['morning_in', 'lunch_out', 'lunch_in', 'evening_out'];

const schema = z.object({
  date: z.string().min(1, 'Date is required'),
  punchTime: z.string().min(1, 'Time is required'),
  punchSlot: z.enum(['morning_in', 'lunch_out', 'lunch_in', 'evening_out']),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(200, 'Reason is too long (max 200 characters)'),
});
type FormData = z.infer<typeof schema>;

const STAGE_LABEL: Record<string, string> = {
  pending_hod: 'Awaiting Department Head',
  pending_hr: 'Awaiting HR',
  approved: 'Approved',
  rejected: 'Rejected',
};

function badgeVariant(status: string): 'pending' | 'approved' | 'rejected' | 'onleave' {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_hr') return 'onleave';
  return 'pending';
}

export default function MissingPunchScreen() {
  const { user } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data, isLoading, refetch, isRefetching } = useMissingPunch(user?.employeeId ?? null);
  const submit = useSubmitMissingPunch(user?.employeeId ?? null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: todayStr, punchTime: '09:30', punchSlot: 'morning_in', reason: '' },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (formData: FormData) => {
    try {
      await submit.mutateAsync(formData);
      setShowNew(false);
      reset({ date: todayStr, punchTime: '09:30', punchSlot: 'morning_in', reason: '' });
      setShowSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit. Please try again.';
      showToast(msg, 'error');
    }
  };

  const items = data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !items.length && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.introCard}>
            <View style={styles.introRow}>
              <MaterialCommunityIcons name="fingerprint" size={22} color={Colors.tertiary} />
              <Text style={styles.introTitle}>Missing Punch</Text>
            </View>
            <Text style={styles.introBody}>
              Forgot to punch in or out? Submit the date, time and reason — your Department Head reviews it first,
              then HR gives the final approval. Once HR approves, the punch is added to your attendance automatically.
            </Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState
              icon="fingerprint"
              title="No Missing Punch requests"
              subtitle="Requests you submit will appear here"
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.type}>
                {item.punchSlot ? PUNCH_SLOT_LABEL[item.punchSlot] : (item.punchType === 'IN' ? 'Check-In' : 'Check-Out')}
              </Text>
              <Badge label={STAGE_LABEL[item.status]} variant={badgeVariant(item.status)} />
            </View>
            <Text style={styles.dateTime}>
              {format(new Date(item.date), 'dd MMM yyyy')} · {item.punchTime}
            </Text>
            {item.reason && <Text style={styles.reason}>{item.reason}</Text>}
            {item.hodReviewedBy && (
              <Text style={styles.reviewLine}>
                Department Head: {item.status === 'rejected' && !item.hrReviewedBy ? 'rejected' : 'approved'} by {item.hodReviewedBy}
              </Text>
            )}
            {item.hrReviewedBy && (
              <Text style={styles.reviewLine}>
                HR: {item.status === 'rejected' ? 'rejected' : 'approved'} by {item.hrReviewedBy}
              </Text>
            )}
            {item.status === 'approved' && (
              <Text style={styles.approvedHint}>Added to your attendance.</Text>
            )}
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* New Request Sheet */}
      <BottomSheet visible={showNew} onClose={() => { setShowNew(false); reset(); }} title="Report a Missing Punch">
        <Text style={styles.fieldLabel}>Which Punch Was Missed?</Text>
        <Controller
          control={control}
          name="punchSlot"
          render={({ field: { onChange, value } }) => (
            <View style={styles.typeRow}>
              {PUNCH_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={[styles.chip, value === slot && styles.chipActive]}
                  onPress={() => onChange(slot)}
                >
                  <Text style={[styles.chipText, value === slot && styles.chipTextActive]}>
                    {PUNCH_SLOT_LABEL[slot]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        <Controller
          control={control}
          name="date"
          render={({ field: { onChange, value } }) => (
            <DatePickerField label="Date" value={value} onChange={onChange} error={errors.date?.message} />
          )}
        />

        <Controller
          control={control}
          name="punchTime"
          render={({ field: { onChange, value } }) => (
            <TimePickerField label="Time" value={value} onChange={onChange} error={errors.punchTime?.message} />
          )}
        />

        <Controller
          control={control}
          name="reason"
          render={({ field: { onChange, value, onBlur } }) => (
            <TextArea
              label="Reason"
              placeholder="Why was this punch missed?"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              minLength={5}
              maxLength={200}
              error={errors.reason?.message}
            />
          )}
        />

        <Button title="Submit Request" onPress={handleSubmit(onSubmit)} loading={submit.isPending} />
      </BottomSheet>

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message="Your Missing Punch request has been sent to your Department Head for approval."
        onDone={() => setShowSuccess(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 100 },
  center: { flex: 1 },

  introCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 14,
    gap: Spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.10, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  introBody: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  dateTime: { color: Colors.textMuted, fontSize: 13 },
  reason: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic' },
  reviewLine: { color: Colors.textMuted, fontSize: 11.5 },
  approvedHint: { color: Colors.statusGreen, fontSize: 11.5, fontWeight: '600' },

  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.outlineVariant },
  chipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}22` },
  chipText: { color: Colors.textMuted, fontSize: 13 },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },
});
