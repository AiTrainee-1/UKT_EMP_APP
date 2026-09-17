import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
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
import { useEmployee } from '../../src/hooks/useEmployee';
import { useOutpassRequests, useSubmitOutpassRequest, type OutpassRequestItem } from '../../src/hooks/useOutpass';
import { OutpassFlipCard } from '../../src/components/outpass/OutpassFlipCard';
import { TeaBreakPanel } from '../../src/components/tea-break/TeaBreakPanel';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { TextArea } from '../../src/components/ui/TextArea';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';

type Section = 'outpass' | 'teaBreak';

const schema = z.object({
  destination: z.string().min(2, 'Please enter where you are going'),
  reason: z.string().min(5, 'Provide a reason (min 5 characters)').max(300, 'Reason is too long (max 300 characters)'),
});
type FormData = z.infer<typeof schema>;

type ReqTab = 'live' | 'confirmed';

const APPROVER_LABEL: Record<string, string> = { dept_head: 'HOD', hr: 'HR', system: 'On-Duty approval' };

export default function OutpassScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const [section, setSection] = useState<Section>('outpass');
  const [showNew, setShowNew] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [tab, setTab] = useState<ReqTab>('live');
  const [previewItem, setPreviewItem] = useState<OutpassRequestItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });

  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data, isLoading, refetch, isRefetching } = useOutpassRequests(user?.employeeId ?? null);
  const submit = useSubmitOutpassRequest(user?.employeeId ?? null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { destination: '', reason: '' },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const onSubmit = async (formData: FormData) => {
    try {
      await submit.mutateAsync(formData);
      setShowNew(false);
      reset({ destination: '', reason: '' });
      setShowSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit. Please try again.';
      showToast(msg, 'error');
    }
  };

  const items = data ?? [];
  const liveList = items.filter((i) => i.status === 'pending');
  const confirmedList = items.filter((i) => i.status !== 'pending');
  const activeList = tab === 'live' ? liveList : confirmedList;

  // Most recent still-relevant approved request -source can be "manual" or
  // "on_duty" (an On-Duty request whose final approval just fired, see
  // backend/api/geo_attendance_views.py::_create_outpass_from_on_duty);
  // either way it renders here the same way. Once exited but not yet
  // returned, the card stays pinned here regardless of the original
  // approval window (expiresAt only bounds the EXIT leg) -the employee may
  // be out well past that 60-minute mark, and still needs "Generate Return
  // QR" to be easy to find.
  const activePass = [...items]
    .filter((i) => {
      if (i.status !== 'approved') return false;
      if (i.exitedAt && !i.enteredAt) return true;
      return !!i.expiresAt && new Date(i.expiresAt).getTime() > Date.now();
    })
    .sort((a, b) => new Date(b.approvedAt ?? 0).getTime() - new Date(a.approvedAt ?? 0).getTime())[0];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Section switcher -"a new header tab under the Outpass section":
          Outpass and Tea Break are two independent bodies sharing this one
          screen/route, exactly like the HR portal's Outpass/Visitors/Tea
          Break sidebar group shares one page component. */}
      <View style={styles.sectionBar}>
        {([
          { key: 'outpass' as Section, label: 'Outpass' },
          { key: 'teaBreak' as Section, label: 'Tea Break' },
        ]).map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sectionBtn, section === s.key && styles.sectionBtnActive]}
            onPress={() => setSection(s.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.sectionLabel, section === s.key && styles.sectionLabelActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'teaBreak' ? (
        <ScrollView contentContainerStyle={styles.pad}>
          <TeaBreakPanel employeeId={user?.employeeId ?? null} />
        </ScrollView>
      ) : (
        <FlatList
          data={activeList}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.pad, !activeList.length && styles.center]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
          ListHeaderComponent={
            <>
              {activePass && <OutpassFlipCard request={activePass} employee={employee} />}

              <View style={styles.tabBar}>
                {([
                  { key: 'live' as ReqTab, label: 'Live Requests', count: liveList.length },
                  { key: 'confirmed' as ReqTab, label: 'Confirmed Requests', count: confirmedList.length },
                ]).map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                    onPress={() => setTab(t.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                      {t.label} ({t.count})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          }
          ListEmptyComponent={
            isLoading ? (
              <View>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</View>
            ) : (
              <EmptyState
                icon="hand-pointing-right"
                title={tab === 'live' ? 'No live requests' : 'No confirmed requests'}
                subtitle="Your outpass requests will appear here"
              />
            )
          }
          renderItem={({ item }) => {
            const variant = item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'pending';
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.destination}>{item.destination}</Text>
                  <Badge label={item.status === 'approved' ? 'Approved' : item.status === 'rejected' ? 'Not Approved' : 'Pending'} variant={variant} />
                </View>
                <Text style={styles.reason}>{item.reason}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.dateTime}>
                    {format(new Date(item.createdAt), 'dd MMM yyyy · h:mm a')}
                    {item.source === 'on_duty' && ' · from On-Duty'}
                    {item.approverRole && item.status === 'approved' && ` · Approved by ${APPROVER_LABEL[item.approverRole] ?? item.approverRole}`}
                  </Text>
                  <TouchableOpacity style={styles.previewBtn} onPress={() => setPreviewItem(item)} activeOpacity={0.7}>
                    <MaterialCommunityIcons name="card-account-details-outline" size={13} color={Colors.primary} />
                    <Text style={styles.previewBtnText}>Preview</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {section === 'outpass' && (
        <>
          {/* FAB */}
          <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
            <MaterialCommunityIcons name="plus" size={26} color="#fff" />
          </TouchableOpacity>

          {/* New Request Sheet */}
          <BottomSheet visible={showNew} onClose={() => { setShowNew(false); reset(); }} title="Request an Outpass">
            <Controller
              control={control}
              name="destination"
              render={({ field: { onChange, value, onBlur } }) => (
                <Input
                  label="Where are you going?"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.destination?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="reason"
              render={({ field: { onChange, value, onBlur } }) => (
                <TextArea
                  label="Reason"
                  placeholder="Describe your reason..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  minLength={5}
                  maxLength={300}
                  error={errors.reason?.message}
                />
              )}
            />

            <Button title="Submit Request" onPress={handleSubmit(onSubmit)} loading={submit.isPending} />
          </BottomSheet>

          {/* Outpass card preview -any request, any status, opened from its row */}
          <BottomSheet visible={!!previewItem} onClose={() => setPreviewItem(null)} title="Outpass Card">
            {previewItem && <OutpassFlipCard request={previewItem} employee={employee} />}
          </BottomSheet>
        </>
      )}

      <Toast {...toast} />
      <SuccessOverlay
        visible={showSuccess}
        title="Request Submitted!"
        message="Your outpass request has been sent for approval."
        onDone={() => setShowSuccess(false)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 100 },
  center: { flex: 1 },

  sectionBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 4,
    gap: 4,
  },
  sectionBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center' },
  sectionBtnActive: { backgroundColor: Colors.primary },
  sectionLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: '800' },
  sectionLabelActive: { color: '#fff' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  tabBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },

  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  destination: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  dateTime: { color: Colors.textMuted, fontSize: 12, flex: 1 },
  reason: { color: Colors.textSecondary, fontSize: 13 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3 },
  previewBtnText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
});
