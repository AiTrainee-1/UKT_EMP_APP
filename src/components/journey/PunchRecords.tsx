import React, { useEffect, useState } from 'react';
import { Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getToken } from '../../lib/auth';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { coordsText, punchChip, punchTypeLabel } from '../../tracking/activity';
import { formatClock } from '../../tracking/format';
import type { JourneyPunch } from '../../tracking/journeyModel';
import { StatusChip } from './StatusChip';
import { toneStyle } from './tone';
import { useAuthedImage } from './useAuthedImage';

/** The photo of a punch: GET /on-duty-punch-verifications/<id>/photo?n=1|2, which needs the bearer token (the owner may open it). */
function photoSource(id: number, n: 1 | 2, token: string | null) {
  const base = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  return { uri: `${base}/on-duty-punch-verifications/${id}/photo?n=${n}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

/** The bearer token; undefined until it has been read (an image must not be requested before that: it would be refused, 401). */
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

interface Props {
  punches: JourneyPunch[];
  onShowOnMap: (lat: number, lng: number) => void;
}

interface PhotoProps {
  id: number;
  n: 1 | 2;
  token: string | null | undefined;
  label: string;
  onOpen: (source: ImageSourcePropType, label: string) => void;
  styles: ReturnType<typeof makeStyles>;
  C: Palette;
}

function Photo({ id, n, token, label, onOpen, styles, C }: PhotoProps) {
  const [broken, setBroken] = useState(false);
  const { source, failed } = useAuthedImage(token === undefined ? null : photoSource(id, n, token));
  if (failed || broken) {
    return (
      <View style={[styles.thumb, styles.thumbMissing]} accessible accessibilityLabel={`${label} is not available`}>
        <MaterialCommunityIcons name="image-off-outline" size={22} color={C.textMuted} />
        <Text style={styles.thumbMissingText}>Not available</Text>
      </View>
    );
  }
  if (!source) return <View style={styles.thumb} accessibilityLabel={`${label} is loading`} />;
  return (
    <TouchableOpacity onPress={() => onOpen(source, label)} activeOpacity={0.8} accessibilityRole="imagebutton" accessibilityLabel={`${label}. Tap to enlarge`}>
      <Image source={source} style={styles.thumb} onError={() => setBroken(true)} accessibilityLabel={label} />
      <View style={styles.thumbTag}>
        <Text style={styles.thumbTagText}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** "Geo-punch records": every punch of the journey with its time, status, place and the photos taken. */
export function PunchRecords({ punches, onShowOnMap }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const token = useToken();
  const [viewer, setViewer] = useState<{ source: ImageSourcePropType; label: string } | null>(null);

  if (punches.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="fingerprint-off" size={26} color={C.textMuted} />
        <Text style={styles.emptyText}>No geo-punch was recorded on this journey.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {punches.map((p) => {
        const chip = punchChip(p.status);
        const t = toneStyle(p.isMocked ? 'red' : chip.tone, C);
        const place = p.latitude != null && p.longitude != null ? ([p.latitude, p.longitude] as const) : null;
        return (
          <View key={p.id} style={styles.card}>
            <View style={styles.top}>
              <View style={[styles.num, { backgroundColor: t.solid }]}>
                <Text style={styles.numText}>{p.punchNumber}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>Geo-punch {p.punchNumber} · {punchTypeLabel(p.punchType)}</Text>
                <Text style={[styles.when, TabularNums]}>{formatClock(p.at)}</Text>
              </View>
              <StatusChip label={chip.label} tone={chip.tone} dot />
            </View>

            {place && (
              <View style={styles.placeRow}>
                <MaterialCommunityIcons name="map-marker-outline" size={16} color={C.textMuted} />
                <Text style={[styles.place, TabularNums]} numberOfLines={1}>
                  {coordsText(place[0], place[1])}
                  {p.accuracyM != null ? `  ·  ±${Math.round(p.accuracyM)} m` : ''}
                </Text>
              </View>
            )}
            {p.isMocked && (
              <View style={styles.warn}>
                <MaterialCommunityIcons name="alert-outline" size={14} color={C.statusRed} />
                <Text style={styles.warnText}>A fake location was reported with this punch.</Text>
              </View>
            )}

            {(p.hasPhoto || p.hasPhoto2) && (
              <View style={styles.photos}>
                {p.hasPhoto && (
                  <Photo id={p.id} n={1} token={token} label={p.hasPhoto2 ? 'Photo 1 of 2' : 'Photo'} onOpen={(source, label) => setViewer({ source, label })} styles={styles} C={C} />
                )}
                {p.hasPhoto2 && (
                  <Photo id={p.id} n={2} token={token} label="Photo 2 of 2" onOpen={(source, label) => setViewer({ source, label })} styles={styles} C={C} />
                )}
              </View>
            )}

            {!!p.reviewComment && (
              <View style={styles.note}>
                <MaterialCommunityIcons name="message-text-outline" size={14} color={C.textMuted} />
                <Text style={styles.noteText}>HR: {p.reviewComment}</Text>
              </View>
            )}

            {place && (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.action} onPress={() => onShowOnMap(place[0], place[1])} accessibilityRole="button" accessibilityLabel={`Show geo-punch ${p.punchNumber} on the map`}>
                  <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={C.primary} />
                  <Text style={styles.actionText}>Show on map</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.action}
                  onPress={() => {
                    void Linking.openURL(`https://www.google.com/maps?q=${place[0]},${place[1]}`);
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={`Open geo-punch ${p.punchNumber} in Google Maps`}
                >
                  <MaterialCommunityIcons name="google-maps" size={16} color={C.primary} />
                  <Text style={styles.actionText}>Google Maps</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          {viewer && <Image source={viewer.source} style={styles.viewerImage} resizeMode="contain" accessibilityLabel={viewer.label} />}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel="Close photo">
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {viewer && <Text style={styles.viewerLabel}>{viewer.label}</Text>}
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    empty: { alignItems: 'center', gap: 8, backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, padding: 20 },
    emptyText: { fontSize: 12.5, color: C.textMuted, textAlign: 'center' },
    card: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, padding: Spacing.base - 2, gap: 10 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    num: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    numText: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 15 },
    title: { fontSize: 14, fontWeight: '800', color: C.textPrimary },
    when: { fontSize: 12, color: C.textMuted },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    place: { fontSize: 12.5, color: C.textSecondary, flexShrink: 1 },
    warn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    warnText: { fontSize: 11.5, color: C.statusRed, flexShrink: 1 },
    photos: { flexDirection: 'row', gap: 10 },
    thumb: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: C.bgSurfaceLow },
    thumbMissing: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
    thumbMissingText: { fontSize: 10.5, color: C.textMuted },
    thumbTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(15,23,42,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    thumbTagText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: C.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 8 },
    noteText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: BorderRadius.md, backgroundColor: C.bgSurfaceLow },
    actionText: { fontSize: 12.5, fontWeight: '700', color: C.primary },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    viewerClose: { position: 'absolute', top: 40, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    viewerLabel: { position: 'absolute', bottom: 40, alignSelf: 'center', color: '#fff', fontSize: 13, fontWeight: '700' },
  });
