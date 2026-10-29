import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { confirmBlocker, photoProgressText, photoSlotViews } from '../../lib/onDutyPhotos';
import type { PhotoPlan } from '../../lib/onDutyPhotos';
import { Button } from '../ui/Button';

export type LocationState =
  | { status: 'loading' }
  | { status: 'ready'; accuracy?: number }
  | { status: 'error'; message: string };

interface Props {
  punchNumber: number;
  punchTypeLabel: string;
  plan: PhotoPlan;
  location: LocationState;
  /** A photo is being taken or the punch is being sent: nothing else can be tapped. */
  busy: boolean;
  /** The punch is being sent (the confirm button spins). */
  submitting: boolean;
  onTakePhoto: (index: number) => void;
  onRefreshLocation: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Recording one geo-punch: "Photo 1 of 2" / "Photo 2 of 2" as thumbnails (one tile when HR asks for one photo), each retaken
 * on its own, your location with its accuracy, and ONE confirm button that stays off until every photo is taken and the
 * location is known. Controlled by the On-Duty page, which owns the camera, the location and the submit.
 */
export function PunchCapture({ punchNumber, punchTypeLabel, plan, location, busy, submitting, onTakePhoto, onRefreshLocation, onConfirm, onCancel }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const slots = photoSlotViews(plan);
  const hasLocation = location.status === 'ready';
  const blocker = confirmBlocker(plan, hasLocation);
  const single = plan.required === 1;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Punch {punchNumber} · {punchTypeLabel}</Text>
          <Text style={styles.progress}>{photoProgressText(plan)}</Text>
        </View>
        <TouchableOpacity
          onPress={location.status === 'ready' ? undefined : onRefreshLocation}
          disabled={busy || location.status === 'loading' || location.status === 'ready'}
          activeOpacity={0.8}
          style={[styles.locPill, location.status === 'ready' ? styles.locOk : location.status === 'error' ? styles.locBad : styles.locWait]}
          accessibilityRole="button"
          accessibilityLabel={
            location.status === 'ready'
              ? `Location found${location.accuracy != null ? `, accuracy ${Math.round(location.accuracy)} metres` : ''}`
              : location.status === 'error'
                ? `${location.message} Tap to try again`
                : 'Finding your location'
          }
        >
          {location.status === 'loading' ? (
            <ActivityIndicator size="small" color={C.textMuted} />
          ) : (
            <MaterialCommunityIcons
              name={location.status === 'ready' ? 'crosshairs-gps' : 'refresh'}
              size={14}
              color={location.status === 'ready' ? C.statusGreen : C.statusRed}
            />
          )}
          <Text style={[styles.locText, { color: location.status === 'ready' ? C.statusGreen : location.status === 'error' ? C.statusRed : C.textMuted }]} numberOfLines={1}>
            {location.status === 'ready'
              ? location.accuracy != null ? `±${Math.round(location.accuracy)} m` : 'Located'
              : location.status === 'error' ? 'Try again' : 'Locating'}
          </Text>
        </TouchableOpacity>
      </View>

      {location.status === 'error' && <Text style={styles.error}>{location.message}</Text>}

      <View style={styles.slots}>
        {slots.map((slot) => (
          <TouchableOpacity
            key={slot.index}
            style={[styles.slot, single ? styles.slotWide : styles.slotSquare, !slot.uri && styles.slotEmpty, slot.isNext && styles.slotNext]}
            onPress={() => onTakePhoto(slot.index)}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={slot.uri ? `${slot.label}, taken. Double tap to retake` : `${slot.label}, not taken yet. Double tap to open the camera`}
          >
            {slot.uri ? (
              <>
                <Image source={{ uri: slot.uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel={slot.label} />
                <View style={styles.doneBadge}>
                  <MaterialCommunityIcons name="check" size={14} color="#fff" />
                </View>
                <View style={styles.bar}>
                  <Text style={styles.barText} numberOfLines={1}>{slot.label}</Text>
                  <View style={styles.retake}>
                    <MaterialCommunityIcons name="camera-retake-outline" size={14} color="#fff" />
                    <Text style={styles.retakeText}>Retake</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyInner}>
                <MaterialCommunityIcons name="camera-plus-outline" size={single ? 32 : 28} color={slot.isNext ? C.primary : C.textMuted} />
                <Text style={[styles.slotLabel, slot.isNext && { color: C.primary }]}>{slot.label}</Text>
                <Text style={styles.slotSub}>{slot.isNext ? 'Tap to take' : 'Not taken yet'}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.hint}>
        This punch is held until your On-Duty request is confirmed. You don't have to wait for it: your next punch can go in straight away.
      </Text>

      <Button title={`Confirm Punch ${punchNumber}`} onPress={onConfirm} loading={submitting} disabled={blocker != null || busy} />
      {blocker != null && <Text style={styles.blocker}>{blocker}</Text>}
      <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    heading: { fontSize: 14.5, fontWeight: '800', color: C.textPrimary },
    progress: { fontSize: 12, color: C.textMuted, marginTop: 1 },
    locPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: BorderRadius.full },
    locOk: { backgroundColor: C.badgeGreenBg },
    locBad: { backgroundColor: C.badgeRedBg },
    locWait: { backgroundColor: C.bgSurfaceLow },
    locText: { fontSize: 12, fontWeight: '800' },
    error: { fontSize: 12, color: C.statusRed, lineHeight: 17 },
    slots: { flexDirection: 'row', gap: 10 },
    slot: { flex: 1, borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: C.bgSurfaceLow },
    slotSquare: { aspectRatio: 1 },
    slotWide: { aspectRatio: 1.6 },
    slotEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.outlineVariant },
    slotNext: { borderColor: C.primary, backgroundColor: C.primaryFixed },
    emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, padding: 8 },
    slotLabel: { fontSize: 12.5, fontWeight: '800', color: C.textSecondary, textAlign: 'center' },
    slotSub: { fontSize: 11, color: C.textMuted, textAlign: 'center' },
    thumb: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
    doneBadge: { position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
    bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, backgroundColor: 'rgba(15,23,42,0.72)', paddingHorizontal: 8, paddingVertical: 6 },
    barText: { flexShrink: 1, color: '#fff', fontSize: 10.5, fontWeight: '700' },
    retake: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    retakeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    hint: { fontSize: 11.5, color: C.textMuted, lineHeight: 16 },
    blocker: { fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: -4 },
  });
