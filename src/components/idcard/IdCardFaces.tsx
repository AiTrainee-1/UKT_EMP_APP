import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';

import { Avatar } from '../ui/Avatar';
import { UKTLogo } from '../UKTLogo';
import type { IdCardData, IdCardTemplate } from '../../hooks/useIdCard';
import { idCardHeight, scaledSize } from '../../lib/idCard';

/**
 * The card faces. They look like the printed card in BOTH app themes (a physical card is
 * white), so they use the HR template colours and fixed card colours, not the app palette.
 */

const INK = '#0f172a';
const MUTED = '#5b6b80';
const RULE = '#c7d2e0';
const TINT = '#eaf6fd';

const MONO = Platform.select({ ios: 'Courier', android: 'monospace' });

export interface FaceProps {
  data: IdCardData;
  template: IdCardTemplate;
  qrValue: string;
  width: number;
  /** HR's status in words when the employee is not active ("Inactive", "Resigned" …). */
  inactiveLabel: string | null;
}

function fmtDate(str?: string | null) {
  if (!str) return '—';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function useScale(width: number, design: number) {
  return useMemo(() => (n: number) => scaledSize(n, width, design), [width, design]);
}

function Row({ label, value, f, wide }: { label: string; value: string; f: (n: number) => number; wide?: boolean }) {
  return (
    <View style={[styles.row, { paddingVertical: f(5) }]}>
      <Text style={[styles.rowLabel, { fontSize: f(9) }]}>{label}</Text>
      <Text style={[styles.rowValue, { fontSize: f(9.5), maxWidth: wide ? '72%' : '62%' }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

function Header({ data, template, f }: { data: IdCardData; template: IdCardTemplate; f: (n: number) => number }) {
  const logo = f(30);
  return (
    <>
      <LinearGradient
        colors={[template.primaryColor, template.secondaryColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerBar, { padding: f(10), gap: f(8) }]}
      >
        <View style={[styles.headerLogo, { width: logo, height: logo, borderRadius: logo / 2 }]}>
          {data.company?.logo ? (
            <Image source={{ uri: data.company.logo }} style={{ width: logo - 6, height: logo - 6, borderRadius: (logo - 6) / 2 }} />
          ) : (
            <UKTLogo size={logo - 8} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.companyName, { fontSize: f(12.5) }]} numberOfLines={1}>
            {data.company?.name || 'UK Textiles'}
          </Text>
          {!!data.company?.address && (
            <Text style={[styles.companyAddress, { fontSize: f(7.5) }]} numberOfLines={1}>
              {data.company.address}
            </Text>
          )}
        </View>
      </LinearGradient>
      <View style={[styles.subHeader, { paddingVertical: f(4) }]}>
        <Text style={[styles.subHeaderText, { color: template.primaryColor, fontSize: f(8) }]}>EMPLOYEE IDENTITY CARD</Text>
      </View>
    </>
  );
}

function Footer({ template, f }: { template: IdCardTemplate; f: (n: number) => number }) {
  return (
    <LinearGradient
      colors={[template.primaryColor, template.secondaryColor, template.primaryColor]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ height: f(10) }}
    />
  );
}

/** A red rubber-stamp across the card when HR's record is not "active". */
function InactiveStamp({ label, f }: { label: string; f: (n: number) => number }) {
  return (
    <View style={styles.stampWrap} pointerEvents="none">
      <View style={[styles.stamp, { paddingHorizontal: f(12), paddingVertical: f(5), borderWidth: f(2.5) }]}>
        <Text style={[styles.stampText, { fontSize: f(15) }]}>NOT ACTIVE</Text>
        <Text style={[styles.stampSub, { fontSize: f(8.5) }]}>{label.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function Shell({
  width,
  isProduction,
  children,
}: {
  width: number;
  isProduction: boolean;
  children: React.ReactNode;
}) {
  return <View style={[styles.card, { width, height: idCardHeight(width, isProduction) }]}>{children}</View>;
}

export function StaffFront({ data, template, width, inactiveLabel }: FaceProps) {
  const f = useScale(width, 300);
  const photo = Math.round(f(100));
  return (
    <Shell width={width} isProduction={false}>
      <Header data={data} template={template} f={f} />
      <View style={[styles.staffBody, { padding: f(14), gap: f(8) }]}>
        <View style={[styles.photoRing, { padding: f(3), borderRadius: photo, borderColor: template.secondaryColor }]}>
          <Avatar
            uri={data.photoUrl}
            name={data.name}
            size={photo}
            bgColor={TINT}
            textColor={template.primaryColor}
          />
        </View>
        <Text style={[styles.name, { fontSize: f(16) }]} numberOfLines={2}>{data.name}</Text>
        {!!data.designation && (
          <View style={[styles.designationPill, { backgroundColor: `${template.primaryColor}18`, paddingHorizontal: f(10), paddingVertical: f(3) }]}>
            <Text style={[styles.designationText, { color: template.primaryColor, fontSize: f(10.5) }]} numberOfLines={1}>
              {data.designation}
            </Text>
          </View>
        )}
        <LinearGradient
          colors={[template.primaryColor, template.secondaryColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.codeStrip, { paddingVertical: f(6), borderRadius: f(9) }]}
        >
          <Text style={[styles.codeLabel, { fontSize: f(7.5) }]}>EMPLOYEE CODE</Text>
          <Text style={[styles.codeValue, { fontSize: f(15) }]}>{data.code}</Text>
        </LinearGradient>
        <View style={{ width: '100%' }}>
          <Row label="Department" value={data.department} f={f} />
          <Row label="Joined" value={fmtDate(data.joinDate)} f={f} />
        </View>
      </View>
      <Footer template={template} f={f} />
      {inactiveLabel && <InactiveStamp label={inactiveLabel} f={f} />}
    </Shell>
  );
}

export function StaffBack({ data, template, qrValue, width, inactiveLabel }: FaceProps) {
  const f = useScale(width, 300);
  return (
    <Shell width={width} isProduction={false}>
      <Header data={data} template={template} f={f} />
      <View style={[styles.staffBackBody, { padding: f(14), gap: f(2) }]}>
        <Row label="Blood Group" value={data.bloodGroup || ''} f={f} />
        <Row label="Date of Birth" value={fmtDate(data.dateOfBirth)} f={f} />
        <Row label="Emergency Contact" value={data.emergencyContact || ''} f={f} />
        <Row label="Address" value={data.address || ''} f={f} wide />

        {template.showQrOnBack && !!qrValue && (
          <View style={[styles.qrWrap, { marginTop: f(10), gap: f(4) }]}>
            <View style={[styles.qrFrame, { padding: f(6), borderRadius: f(10) }]}>
              <QRCode value={qrValue} size={Math.round(f(84))} color={INK} backgroundColor="#fff" />
            </View>
            <Text style={[styles.qrCaption, { color: template.primaryColor, fontSize: f(8) }]}>SCAN TO VERIFY EMPLOYEE</Text>
          </View>
        )}

        <Text style={[styles.instructions, { fontSize: f(7.5), lineHeight: f(10.5), marginTop: f(8) }]}>
          This card remains the property of {data.company?.name || 'the company'}. If found, please return it to the
          address above. Unauthorised use is prohibited.
        </Text>

        {data.company?.signature ? (
          <View style={[styles.signatureWrap, { marginTop: f(6) }]}>
            <Image source={{ uri: data.company.signature }} style={{ width: f(64), height: f(24), resizeMode: 'contain' }} />
            <Text style={[styles.signatureCaption, { fontSize: f(7.5) }]}>Authorised Signatory</Text>
          </View>
        ) : null}
      </View>
      <Footer template={template} f={f} />
      {inactiveLabel && <InactiveStamp label={inactiveLabel} f={f} />}
    </Shell>
  );
}

export function ProductionFront({ data, template, width, inactiveLabel }: FaceProps) {
  const f = useScale(width, 380);
  const photo = Math.round(f(78));
  return (
    <Shell width={width} isProduction>
      <Header data={data} template={template} f={f} />
      <View style={[styles.prodBody, { padding: f(12), gap: f(12) }]}>
        <View style={[styles.photoRing, { padding: f(2.5), borderRadius: photo, borderColor: template.secondaryColor }]}>
          <Avatar uri={data.photoUrl} name={data.name} size={photo} bgColor={TINT} textColor={template.primaryColor} />
        </View>
        <View style={{ flex: 1, gap: f(4) }}>
          <Text style={[styles.name, { fontSize: f(14.5), textAlign: 'left' }]} numberOfLines={2}>{data.name}</Text>
          {!!data.designation && (
            <View style={[styles.designationPill, { backgroundColor: `${template.primaryColor}18`, alignSelf: 'flex-start', paddingHorizontal: f(8), paddingVertical: f(2) }]}>
              <Text style={[styles.designationText, { color: template.primaryColor, fontSize: f(9.5) }]} numberOfLines={1}>
                {data.designation}
              </Text>
            </View>
          )}
          <LinearGradient
            colors={[template.primaryColor, template.secondaryColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.codeStrip, { paddingVertical: f(4), borderRadius: f(8) }]}
          >
            <Text style={[styles.codeValue, { fontSize: f(13) }]}>{data.code}</Text>
          </LinearGradient>
        </View>
        <View style={{ width: f(118) }}>
          <Row label="Dept" value={data.department} f={f} />
          <Row label="Joined" value={fmtDate(data.joinDate)} f={f} />
          <Row label="Type" value="Production" f={f} />
        </View>
      </View>
      <Footer template={template} f={f} />
      {inactiveLabel && <InactiveStamp label={inactiveLabel} f={f} />}
    </Shell>
  );
}

export function ProductionBack({ data, template, qrValue, width, inactiveLabel }: FaceProps) {
  const f = useScale(width, 380);
  return (
    <Shell width={width} isProduction>
      <Header data={data} template={template} f={f} />
      <View style={[styles.prodBody, { padding: f(12), gap: f(12) }]}>
        {template.showQrOnBack && !!qrValue && (
          <View style={[styles.qrWrap, { gap: f(3) }]}>
            <View style={[styles.qrFrame, { padding: f(4), borderRadius: f(8) }]}>
              <QRCode value={qrValue} size={Math.round(f(76))} color={INK} backgroundColor="#fff" />
            </View>
            <Text style={[styles.qrCaption, { color: template.primaryColor, fontSize: f(7) }]}>SCAN TO VERIFY</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: f(1) }}>
          <Row label="Blood Group" value={data.bloodGroup || ''} f={f} />
          <Row label="Date of Birth" value={fmtDate(data.dateOfBirth)} f={f} />
          <Row label="Emergency" value={data.emergencyContact || ''} f={f} />
          <Row label="Address" value={data.address || ''} f={f} wide />
        </View>
      </View>
      <Footer template={template} f={f} />
      {inactiveLabel && <InactiveStamp label={inactiveLabel} f={f} />}
    </Shell>
  );
}

/** What a screen reader says for each side (the faces themselves are hidden from it). */
export function faceDescription(side: 'front' | 'back', data: IdCardData, inactiveLabel: string | null): string {
  const status = inactiveLabel ? ` Marked not active: ${inactiveLabel}.` : '';
  if (side === 'front') {
    return `Employee ID card, front side. ${data.name}${data.designation ? `, ${data.designation}` : ''}. Employee code ${data.code}. ${data.department ? `Department ${data.department}. ` : ''}Joined ${fmtDate(data.joinDate)}.${status}`;
  }
  return `Employee ID card, back side. Blood group ${data.bloodGroup || 'not given'}. Date of birth ${fmtDate(data.dateOfBirth)}. Emergency contact ${data.emergencyContact || 'not given'}. Address ${data.address || 'not given'}.${status}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerBar: { flexDirection: 'row', alignItems: 'center' },
  headerLogo: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  companyName: { color: '#fff', fontWeight: '800', letterSpacing: 0.2 },
  companyAddress: { color: 'rgba(255,255,255,0.88)', marginTop: 1 },
  subHeader: { backgroundColor: TINT, alignItems: 'center' },
  subHeaderText: { fontWeight: '800', letterSpacing: 1.6 },

  staffBody: { flex: 1, alignItems: 'center' },
  staffBackBody: { flex: 1 },
  prodBody: { flex: 1, flexDirection: 'row', alignItems: 'center' },

  photoRing: { borderWidth: 2, backgroundColor: '#fff' },
  name: { color: INK, fontWeight: '900', textAlign: 'center', letterSpacing: -0.2 },
  designationPill: { borderRadius: 999 },
  designationText: { fontWeight: '700' },

  codeStrip: { width: '100%', alignItems: 'center' },
  codeLabel: { color: 'rgba(255,255,255,0.82)', fontWeight: '700', letterSpacing: 1.2 },
  codeValue: { color: '#fff', fontWeight: '900', letterSpacing: 1.5, fontFamily: MONO },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    borderStyle: 'dashed',
  },
  rowLabel: { color: MUTED, fontWeight: '700' },
  rowValue: { color: INK, fontWeight: '700', flexShrink: 1, textAlign: 'right' },

  qrWrap: { alignItems: 'center' },
  qrFrame: { backgroundColor: '#fff', borderWidth: 1, borderColor: RULE },
  qrCaption: { fontWeight: '800', letterSpacing: 0.9 },

  instructions: { color: MUTED, textAlign: 'center' },
  signatureWrap: { alignItems: 'center', gap: 2 },
  signatureCaption: { color: MUTED, fontWeight: '600' },

  stampWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  stamp: {
    transform: [{ rotate: '-18deg' }],
    borderColor: 'rgba(220,38,38,0.85)',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
  },
  stampText: { color: 'rgba(220,38,38,0.95)', fontWeight: '900', letterSpacing: 2 },
  stampSub: { color: 'rgba(220,38,38,0.9)', fontWeight: '800', letterSpacing: 1.2 },
});
