import React, { useEffect, useState } from 'react';
import { Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getToken } from '../../lib/auth';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useAuthedImage } from '../journey/useAuthedImage';
import { fmtDay } from '../../lib/approvalsHistory';
import { clock12, type OnDutyPunchRow } from '../../lib/approvalsItems';

const fmtDayShort = (day: string) => fmtDay(day, 'dd MMM');

/** GET /on-duty-punch-verifications/<id>/photo?n=1|2: the employee's own Department Head may open it (bearer token). */
function photoSource(id: number, n: 1 | 2, token: string | null) {
  const base = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  return { uri: `${base}/on-duty-punch-verifications/${id}/photo?n=${n}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

function useToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getToken()
      .then((t) => live && setToken(t))
      .catch(() => live && setToken(null));
    return () => {
      live = false;
    };
  }, []);
  return token;
}

function Thumb({
  id,
  n,
  token,
  label,
  onOpen,
}: {
  id: number;
  n: 1 | 2;
  token: string | null | undefined;
  label: string;
  onOpen: (source: ImageSourcePropType, label: string) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [broken, setBroken] = useState(false);
  const { source, failed } = useAuthedImage(token === undefined ? null : photoSource(id, n, token));
  if (failed || broken) {
    return (
      <View style={[styles.thumb, styles.thumbMissing]} accessible accessibilityLabel={`${label} is not available`}>
        <MaterialCommunityIcons name="image-off-outline" size={18} color={Colors.textMuted} />
      </View>
    );
  }
  if (!source) return <View style={[styles.thumb, styles.thumbMissing]} />;
  return (
    <TouchableOpacity onPress={() => onOpen(source, label)} accessibilityRole="imagebutton" accessibilityLabel={`Open ${label}`}>
      <Image source={source} style={styles.thumb} onError={() => setBroken(true)} accessibilityLabel={label} />
    </TouchableOpacity>
  );
}

const STATUS: Record<string, { label: string; icon: string }> = {
  approved: { label: 'Counted', icon: 'check-circle' },
  rejected: { label: 'Not counted', icon: 'close-circle' },
  pending: { label: 'Waiting', icon: 'clock-outline' },
};

/**
 * Every punch the employee recorded under an On-Duty request: In / Out, the time, where (opens the map) and the selfies
 * taken with it - what the head is approving.
 */
export function OnDutyPunchList({ punches }: { punches: OnDutyPunchRow[] }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const token = useToken();
  const [viewer, setViewer] = useState<{ source: ImageSourcePropType; label: string } | null>(null);

  if (!punches.length) {
    return <Text style={styles.none}>No punches recorded under this request yet.</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>PUNCHES RECORDED</Text>
      {punches.map((p) => {
        const st = STATUS[p.status ?? 'pending'] ?? STATUS.pending;
        const where = p.latitude != null && p.longitude != null ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : null;
        return (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.time}>
                {p.punchType === 'OUT' ? 'Out' : 'In'} · {clock12(p.punchTime)}
                {p.punchDate ? <Text style={styles.day}>{`  ${fmtDayShort(p.punchDate)}`}</Text> : null}
              </Text>
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name={st.icon as any} size={12} color={Colors.textMuted} />
                <Text style={styles.meta}>{st.label}</Text>
                {p.isMocked && <Text style={[styles.meta, { color: Colors.statusRed }]}>· Location may be faked</Text>}
              </View>
              {!!where && (
                <TouchableOpacity
                  onPress={() => {
                    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`).catch(() => {});
                  }}
                  accessibilityRole="link"
                  accessibilityLabel="Show this punch on the map"
                >
                  <Text style={styles.link}>Show on map</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.photos}>
              {p.hasPhoto && <Thumb id={p.id} n={1} token={token} label="Punch photo" onOpen={(source, label) => setViewer({ source, label })} />}
              {p.hasPhoto2 && <Thumb id={p.id} n={2} token={token} label="Second punch photo" onOpen={(source, label) => setViewer({ source, label })} />}
            </View>
          </View>
        );
      })}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          {viewer && <Image source={viewer.source} style={styles.viewerImage} resizeMode="contain" accessibilityLabel={viewer.label} />}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel="Close photo">
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: { marginTop: 12, gap: 8 },
    title: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
    none: { color: Colors.textMuted, fontSize: 12, marginTop: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.bgSurfaceLow,
    },
    time: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
    day: { color: Colors.textMuted, fontSize: 11.5, fontFamily: FontFamily.bodyRegular },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    meta: { color: Colors.textMuted, fontSize: 11.5 },
    link: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
    photos: { flexDirection: 'row', gap: 6 },
    thumb: { width: 54, height: 54, borderRadius: BorderRadius.sm, backgroundColor: Colors.bgSurfaceHigh },
    thumbMissing: { alignItems: 'center', justifyContent: 'center' },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    viewerClose: {
      position: 'absolute',
      top: 48,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
