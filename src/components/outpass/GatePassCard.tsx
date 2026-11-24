import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, isValid, parseISO } from 'date-fns';
import QRCode from 'react-native-qrcode-svg';

import { Avatar } from '../ui/Avatar';
import { PendingBell, PendingQrPlaceholder } from './PendingApproval';
import { UKTLogo } from '../UKTLogo';
import { gatePassFileName, gatePassView, type GatePassTone } from '../../lib/gatePass';
import { saveCardImage, saveOutcomeMessage } from '../../lib/saveCardImage';
import { OUTPASS_PASS_TYPE_LABEL, useGenerateReturnOutpassQr, type OutpassRequestItem } from '../../hooks/useOutpass';
import { waitingText } from '../../lib/approval';
import { FontFamily, TabularNums } from '../../constants/typography';

/**
 * The gate pass, as a standard static card (owner 2026-11-24: no flip, no rotation; every detail one after another; the
 * QR on the card; downloadable as a picture). The same card on the Gate Outpass page and on the On-Duty page.
 *
 * The card itself (what is captured for "Download") uses fixed paper-like colours in both themes, the way a printed pass
 * looks the same everywhere; the buttons under it follow the theme. What the card says comes from src/lib/gatePass.ts.
 */

const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const PAPER = '#FFFFFF';
const BAND = '#1E3A8A';

const TONE: Record<GatePassTone, { fg: string; bg: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  green: { fg: '#047857', bg: '#D1FAE5', icon: 'check-decagram' },
  amber: { fg: '#B45309', bg: '#FEF3C7', icon: 'clock-alert-outline' },
  blue: { fg: '#1D4ED8', bg: '#DBEAFE', icon: 'exit-run' },
  red: { fg: '#B91C1C', bg: '#FEE2E2', icon: 'close-octagon' },
  grey: { fg: '#475569', bg: '#F1F5F9', icon: 'clock-outline' },
};

function when(iso?: string | null, pattern = 'd MMM yyyy, h:mm a'): string | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? format(d, pattern) : null;
}

export interface GatePassPerson {
  name?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  designation?: string | null;
  photoUrl?: string | null;
}

function Row({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.row}>
      <MaterialCommunityIcons name={icon} size={16} color={MUTED} style={s.rowIcon} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export function GatePassCard({
  pass,
  person,
  style,
  compact = false,
  showActions = true,
  onRefresh,
  refreshing,
}: {
  pass: OutpassRequestItem & { employee?: GatePassPerson | null; onDutyStatus?: string | null };
  /** The employee (the pass carries one from the server too; this wins when given). */
  person?: GatePassPerson | null;
  style?: StyleProp<ViewStyle>;
  /** Smaller QR and fewer rows (inside the On-Duty page). */
  compact?: boolean;
  showActions?: boolean;
  /** "Refresh" on a pass waiting for approval: look for the decision now. */
  onRefresh?: () => unknown;
  refreshing?: boolean;
}) {
  const view = gatePassView(pass);
  const tone = TONE[view.tone];
  const who: GatePassPerson = { ...(pass.employee ?? {}), ...(person ?? {}) };
  const cardRef = useRef<ViewInstance>(null);
  const [saving, setSaving] = useState(false);
  const generateReturn = useGenerateReturnOutpassQr(pass.employeeId ?? null);
  const onDuty = pass.source === 'on_duty';

  const download = async () => {
    setSaving(true);
    try {
      const message = saveOutcomeMessage(await saveCardImage(cardRef, gatePassFileName(pass)));
      if (message) Alert.alert('Gate pass', message);
    } finally {
      setSaving(false);
    }
  };

  const makeReturnQr = async () => {
    try {
      await generateReturn.mutateAsync(pass.id);
    } catch (err: any) {
      Alert.alert('Return QR', err?.response?.data?.error || 'Could not make the return QR. Please try again.');
    }
  };

  const purpose = onDuty ? 'On-Duty (official work outside)' : pass.passType ? OUTPASS_PASS_TYPE_LABEL[pass.passType] : 'Gate pass';
  const validUntil = view.qr?.kind === 'exit' ? when(pass.expiresAt, onDuty ? 'h:mm a, d MMM' : 'h:mm a') : null;
  const approval =
    pass.status === 'approved'
      ? `Approved${pass.approvedBy ? ` by ${pass.approvedBy}` : ''}${pass.approvedAt ? ` · ${when(pass.approvedAt)}` : ''}`
      : pass.status === 'rejected'
        ? `Not approved${pass.approvedBy ? ` (${pass.approvedBy})` : ''}`
        : onDuty
          ? 'Waiting for the On-Duty approval'
          : waitingText(pass.approval) ?? 'Waiting for approval';

  return (
    <View style={style}>
      <View ref={cardRef} collapsable={false} style={s.card} accessible accessibilityLabel={`Gate pass ${pass.id}. ${view.title}. ${view.note}`}>
        {/* header band */}
        <View style={s.band}>
          <View style={s.logoWell}>
            <UKTLogo size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.company}>UK TEXTILES</Text>
            <Text style={s.passTitle}>GATE PASS</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.passNoLabel}>PASS NO.</Text>
            <Text style={s.passNo}>OUT-{pass.id}</Text>
          </View>
        </View>

        {view.awaitingApproval && (
          <View style={s.ribbon}>
            <MaterialCommunityIcons name="progress-clock" size={14} color="#92400E" />
            <Text style={s.ribbonText}>PENDING APPROVAL · NOT VALID AT THE GATE YET</Text>
          </View>
        )}

        {/* status */}
        <View style={[s.status, { backgroundColor: tone.bg }]}>
          {view.awaitingApproval ? <PendingBell size={20} /> : <MaterialCommunityIcons name={tone.icon} size={20} color={tone.fg} />}
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: tone.fg }]}>{view.title}</Text>
            <Text style={s.statusNote}>{view.note}</Text>
          </View>
        </View>

        {/* employee */}
        <View style={s.person}>
          <Avatar uri={who.photoUrl ?? undefined} name={who.name ?? undefined} size={compact ? 44 : 54} />
          <View style={{ flex: 1 }}>
            <Text style={s.personName} numberOfLines={1}>{who.name ?? 'Employee'}</Text>
            {!!who.employeeCode && <Text style={s.personCode}>Emp. Code {who.employeeCode}</Text>}
            {!!(who.designation || who.department) && (
              <Text style={s.personDept} numberOfLines={1}>{[who.designation, who.department].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
        </View>

        {/* details, one after another */}
        <View style={s.rows}>
          <Row icon="briefcase-outline" label="Purpose" value={purpose} />
          <Row icon="map-marker-outline" label="Going to" value={pass.destination} />
          {!compact && pass.reason && pass.reason !== pass.destination && <Row icon="text-box-outline" label="Reason" value={pass.reason} />}
          <Row icon="calendar-clock" label="Issued" value={when(pass.createdAt)} />
          <Row icon="timer-sand" label="Valid until" value={validUntil} />
          {!compact && <Row icon="clock-check-outline" label="Expected back" value={when(pass.expectedReturnAt ?? null, 'h:mm a')} />}
          <Row icon="shield-check-outline" label="Approval" value={approval} />
          <Row icon="logout-variant" label="Gate exit" value={pass.exitedAt ? `${when(pass.exitedAt)}${pass.exitGateName ? ` · ${pass.exitGateName}` : ''}` : null} />
          <Row icon="login-variant" label="Gate return" value={pass.enteredAt ? `${when(pass.enteredAt)}${pass.entryGateName ? ` · ${pass.entryGateName}` : ''}` : null} />
        </View>

        {/* QR */}
        {view.qr ? (
          <View style={s.qrBlock}>
            <View style={[s.qrFrame, { borderColor: tone.fg }]}>
              <QRCode value={view.qr.value} size={compact ? 132 : 168} color={INK} backgroundColor={PAPER} />
            </View>
            <Text style={[s.qrCaption, { color: tone.fg }]}>{view.qr.caption}</Text>
          </View>
        ) : view.awaitingApproval ? (
          <PendingQrPlaceholder
            onRefresh={onRefresh}
            refreshing={refreshing}
            size={compact ? 132 : 168}
            what={onDuty ? 'your On-Duty' : 'this pass'}
          />
        ) : (
          <View style={s.noQr}>
            <MaterialCommunityIcons name="qrcode-remove" size={18} color={MUTED} />
            <Text style={s.noQrText}>
              No QR: this pass cannot be scanned now.
            </Text>
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>Show this pass to security at the gate. Valid only for the person named above.</Text>
        </View>
      </View>

      {showActions && (
        <View style={s.actions}>
          {pass.canGenerateReturnQr && !pass.returnQrToken && (
            <Pressable
              onPress={() => void makeReturnQr()}
              disabled={generateReturn.isPending}
              style={[s.actionBtn, s.actionPrimary]}
              accessibilityRole="button"
              accessibilityLabel="Make the return QR"
            >
              {generateReturn.isPending ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="qrcode-plus" size={18} color="#fff" />}
              <Text style={[s.actionText, { color: '#fff' }]}>Return QR</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void download()}
            disabled={saving}
            style={s.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Download the gate pass as a picture"
          >
            {saving ? <ActivityIndicator size="small" color={BAND} /> : <MaterialCommunityIcons name="download" size={18} color={BAND} />}
            <Text style={s.actionText}>{saving ? 'Saving...' : 'Download'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: PAPER,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LINE,
  },
  band: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BAND, paddingHorizontal: 16, paddingVertical: 12 },
  logoWell: { width: 40, height: 40, borderRadius: 10, backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center' },
  company: { color: '#BFDBFE', fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 1.2 },
  passTitle: { color: PAPER, fontFamily: FontFamily.displayBold, fontSize: 18, letterSpacing: 1 },
  passNoLabel: { color: '#BFDBFE', fontSize: 9.5, letterSpacing: 1, fontFamily: FontFamily.bodySemibold },
  passNo: { color: PAPER, fontFamily: FontFamily.displayBold, fontSize: 15, ...TabularNums },
  ribbon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FDE68A', paddingVertical: 6 },
  ribbonText: { color: '#92400E', fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 0.6 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, margin: 14, marginBottom: 6, padding: 12, borderRadius: 12 },
  statusTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  statusNote: { color: INK, fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  personName: { color: INK, fontFamily: FontFamily.headlineSemibold, fontSize: 16 },
  personCode: { color: MUTED, fontSize: 12.5, marginTop: 1, ...TabularNums },
  personDept: { color: MUTED, fontSize: 12, marginTop: 1 },
  rows: { marginHorizontal: 16, borderTopWidth: 1, borderTopColor: LINE },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: LINE, gap: 8 },
  rowIcon: { marginTop: 1 },
  rowLabel: { width: 96, color: MUTED, fontSize: 12.5, fontFamily: FontFamily.bodySemibold },
  rowValue: { flex: 1, color: INK, fontSize: 13.5, lineHeight: 18 },
  qrBlock: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  qrFrame: { padding: 10, borderRadius: 14, borderWidth: 2, backgroundColor: PAPER },
  qrCaption: { fontFamily: FontFamily.bodySemibold, fontSize: 12, letterSpacing: 0.8 },
  noQr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 14, padding: 10, borderRadius: 10, backgroundColor: '#F8FAFC' },
  noQrText: { flex: 1, color: MUTED, fontSize: 12.5 },
  footer: { backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 16, paddingVertical: 10 },
  footerText: { color: MUTED, fontSize: 11, textAlign: 'center', lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BAND,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PAPER,
  },
  actionPrimary: { backgroundColor: BAND },
  actionText: { color: BAND, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
});
