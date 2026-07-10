import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useIdCard, useIdCardSettings, IdCardData, IdCardTemplate } from '../../src/hooks/useIdCard';
import { useEmployee } from '../../src/hooks/useEmployee';
import { Avatar } from '../../src/components/ui/Avatar';
import { UKTLogo } from '../../src/components/UKTLogo';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

// Best-effort public web origin for the QR verify link — set
// EXPO_PUBLIC_WEB_APP_URL to the HR Portal's real public URL once known.
const WEB_ORIGIN =
  process.env.EXPO_PUBLIC_WEB_APP_URL ??
  (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/:\d+\/api\/?$/, '');

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 56, 300);

function fmtDate(str?: string | null) {
  if (!str) return '—';
  try {
    return format(new Date(str), 'dd MMM yyyy');
  } catch {
    return str;
  }
}

function DashRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowSt.row}>
      <Text style={rowSt.label}>{label}</Text>
      <Text style={rowSt.value} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const rowSt = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#c7d2e0',
    borderStyle: 'dashed',
  },
  label: { color: '#5b6b80', fontSize: 9, fontWeight: '700' },
  value: { color: '#0f172a', fontSize: 9, fontWeight: '700', flexShrink: 1, textAlign: 'right', maxWidth: '65%' },
});

interface FaceProps {
  data: IdCardData;
  template: IdCardTemplate;
  qrValue: string;
}

function CardHeader({ template, data }: { template: IdCardTemplate; data: IdCardData }) {
  return (
    <>
      <LinearGradient
        colors={[template.primaryColor, template.secondaryColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={cardSt.headerBar}
      >
        <View style={cardSt.headerLogo}>
          {data.company?.logo ? (
            <Image source={{ uri: data.company.logo }} style={{ width: 24, height: 24, borderRadius: 12 }} />
          ) : (
            <UKTLogo size={22} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cardSt.companyName} numberOfLines={1}>{data.company?.name || 'UK Textiles'}</Text>
          <Text style={cardSt.companyAddress} numberOfLines={1}>{data.company?.address || ''}</Text>
        </View>
      </LinearGradient>
      <View style={cardSt.subHeader}>
        <Text style={[cardSt.subHeaderText, { color: template.primaryColor }]}>EMPLOYEE IDENTITY CARD</Text>
      </View>
    </>
  );
}

function CardFooter({ template }: { template: IdCardTemplate }) {
  return (
    <LinearGradient
      colors={[template.primaryColor, template.secondaryColor, template.primaryColor]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={cardSt.footerBar}
    />
  );
}

function StaffFront({ data, template }: FaceProps) {
  return (
    <View style={[cardSt.card, { width: CARD_W, aspectRatio: 240 / 380 }]}>
      <CardHeader template={template} data={data} />
      <View style={cardSt.staffBody}>
        <Avatar uri={data.photoUrl} name={data.name} size={96} borderColor={template.secondaryColor} bgColor={Colors.primaryFixed} />
        <Text style={cardSt.name} numberOfLines={2}>{data.name}</Text>
        <View style={[cardSt.designationPill, { backgroundColor: `${template.primaryColor}18` }]}>
          <Text style={[cardSt.designationText, { color: template.primaryColor }]} numberOfLines={1}>{data.designation}</Text>
        </View>
        <LinearGradient
          colors={[template.primaryColor, template.secondaryColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={cardSt.codeStrip}
        >
          <Text style={cardSt.codeLabel}>EMPLOYEE CODE</Text>
          <Text style={cardSt.codeValue}>{data.code}</Text>
        </LinearGradient>
        <View style={{ width: '100%' }}>
          <DashRow label="Department" value={data.department} />
          <DashRow label="Joined" value={fmtDate(data.joinDate)} />
        </View>
      </View>
      <CardFooter template={template} />
    </View>
  );
}

function StaffBack({ data, template, qrValue }: FaceProps) {
  return (
    <View style={[cardSt.card, { width: CARD_W, aspectRatio: 240 / 380 }]}>
      <CardHeader template={template} data={data} />
      <View style={cardSt.staffBackBody}>
        <DashRow label="Blood Group" value={data.bloodGroup || ''} />
        <DashRow label="Date of Birth" value={fmtDate(data.dateOfBirth)} />
        <DashRow label="Emergency Contact" value={data.emergencyContact || ''} />
        <DashRow label="Address" value={data.address || ''} />

        {template.showQrOnBack && !!qrValue && (
          <View style={cardSt.qrWrap}>
            <QRCode value={qrValue} size={80} color="#0f172a" backgroundColor="#fff" />
            <Text style={[cardSt.qrCaption, { color: template.primaryColor }]}>SCAN TO VERIFY EMPLOYEE</Text>
          </View>
        )}

        <Text style={cardSt.instructions}>
          This card remains the property of {data.company?.name || 'the company'}. If found, please return
          to the address above. Unauthorized use is prohibited.
        </Text>

        {data.company?.signature ? (
          <View style={cardSt.signatureWrap}>
            <Image source={{ uri: data.company.signature }} style={{ width: 60, height: 22, resizeMode: 'contain' }} />
            <Text style={cardSt.signatureCaption}>Authorised Signatory</Text>
          </View>
        ) : null}
      </View>
      <CardFooter template={template} />
    </View>
  );
}

function ProductionFront({ data, template }: FaceProps) {
  return (
    <View style={[cardSt.card, { width: CARD_W, aspectRatio: 380 / 240 }]}>
      <CardHeader template={template} data={data} />
      <View style={cardSt.prodBody}>
        <Avatar uri={data.photoUrl} name={data.name} size={72} borderColor={template.secondaryColor} bgColor={Colors.primaryFixed} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={cardSt.name} numberOfLines={2}>{data.name}</Text>
          <View style={[cardSt.designationPill, { backgroundColor: `${template.primaryColor}18`, alignSelf: 'flex-start' }]}>
            <Text style={[cardSt.designationText, { color: template.primaryColor }]} numberOfLines={1}>{data.designation}</Text>
          </View>
          <LinearGradient
            colors={[template.primaryColor, template.secondaryColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[cardSt.codeStrip, { paddingVertical: 4 }]}
          >
            <Text style={cardSt.codeValue}>{data.code}</Text>
          </LinearGradient>
        </View>
        <View style={{ width: 110 }}>
          <DashRow label="Dept" value={data.department} />
          <DashRow label="Joined" value={fmtDate(data.joinDate)} />
          <DashRow label="Type" value="Production" />
        </View>
      </View>
      <CardFooter template={template} />
    </View>
  );
}

function ProductionBack({ data, template, qrValue }: FaceProps) {
  return (
    <View style={[cardSt.card, { width: CARD_W, aspectRatio: 380 / 240 }]}>
      <CardHeader template={template} data={data} />
      <View style={cardSt.prodBody}>
        {template.showQrOnBack && !!qrValue && (
          <View style={cardSt.qrWrap}>
            <QRCode value={qrValue} size={72} color="#0f172a" backgroundColor="#fff" />
            <Text style={[cardSt.qrCaption, { color: template.primaryColor, fontSize: 7 }]}>SCAN TO VERIFY</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <DashRow label="Blood Group" value={data.bloodGroup || ''} />
          <DashRow label="Date of Birth" value={fmtDate(data.dateOfBirth)} />
          <DashRow label="Emergency" value={data.emergencyContact || ''} />
          <DashRow label="Address" value={data.address || ''} />
        </View>
      </View>
      <CardFooter template={template} />
    </View>
  );
}

function FlipCard({ data, template, qrValue, isProduction }: FaceProps & { isProduction: boolean }) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [showingBack, setShowingBack] = useState(false);

  const flip = () => {
    Animated.spring(flipAnim, {
      toValue: showingBack ? 0 : 1,
      friction: 8.5,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setShowingBack((v) => !v);
  };

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const Front = isProduction ? ProductionFront : StaffFront;
  const Back = isProduction ? ProductionBack : StaffBack;

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={flip} style={{ alignItems: 'center' }}>
      <View>
        <Animated.View style={[cardSt.flipFace, { transform: [{ rotateY: frontRotate }] }]}>
          <Front data={data} template={template} qrValue={qrValue} />
        </Animated.View>
        <Animated.View style={[cardSt.flipFace, cardSt.flipBack, { transform: [{ rotateY: backRotate }] }]}>
          <Back data={data} template={template} qrValue={qrValue} />
        </Animated.View>
      </View>
      <View style={cardSt.flipHint}>
        <MaterialCommunityIcons name="rotate-3d-variant" size={13} color={Colors.textMuted} />
        <Text style={cardSt.flipHintText}>Tap card to flip</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function IdCardScreen() {
  const { user } = useAuth();
  const { data: card, isLoading: cardLoading } = useIdCard(user?.employeeId ?? null);
  const { data: settings } = useIdCardSettings();
  const { data: emp, isLoading: empLoading } = useEmployee(user?.employeeId ?? null);

  // Fall back to the general employee record if the dedicated ID card
  // endpoint isn't reachable for this account.
  const data: IdCardData | null = card ?? (emp
    ? {
        id: emp.id,
        code: emp.employeeCode,
        name: emp.name,
        designation: emp.designationTitle,
        department: emp.departmentName,
        employmentType: emp.employmentType,
        photoUrl: emp.photoUrl ?? null,
        bloodGroup: emp.bloodGroup,
        dateOfBirth: emp.dateOfBirth,
        emergencyContact: emp.emergencyContact,
        address: emp.address,
        phone: emp.phone,
        email: emp.email,
        joinDate: emp.joinDate,
        status: emp.status,
        company: settings?.company,
        template: settings?.template ?? {
          primaryColor: '#006496',
          secondaryColor: '#4FB8F0',
          showQrOnBack: true,
        },
      }
    : null);

  const isLoading = cardLoading && empLoading;
  const isProduction = data?.employmentType === 'production';
  const qrValue = data?.code ? `${WEB_ORIGIN}/verify/${data.code}` : '';
  const template = data?.template ?? { primaryColor: '#006496', secondaryColor: '#4FB8F0', showQrOnBack: true };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Digital ID Card</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isLoading || !data ? (
          <SkeletonCard lines={10} />
        ) : (
          <FlipCard data={data} template={template} qrValue={qrValue} isProduction={isProduction} />
        )}

        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoText}>
            This is your official digital employee ID. Present it for verification when required.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },

  scroll: { padding: 16, paddingTop: 24, paddingBottom: 40, gap: 20, alignItems: 'center' },

  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    alignItems: 'flex-start',
    width: '100%',
  },
  infoText: { color: Colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },
});

const cardSt = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  flipFace: {
    backfaceVisibility: 'hidden',
  },
  flipBack: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  flipHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
  },
  flipHintText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  headerLogo: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  companyName: { color: '#fff', fontSize: 12, fontWeight: '800' },
  companyAddress: { color: 'rgba(255,255,255,0.85)', fontSize: 7 },
  subHeader: {
    backgroundColor: '#eaf6fd',
    paddingVertical: 4,
    alignItems: 'center',
  },
  subHeaderText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },

  staffBody: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  staffBackBody: {
    flex: 1,
    padding: 14,
    gap: 4,
  },
  prodBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },

  name: { color: '#0f172a', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  designationPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  designationText: { fontSize: 10, fontWeight: '700' },

  codeStrip: {
    width: '100%',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  codeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 7, fontWeight: '700', letterSpacing: 1 },
  codeValue: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1, fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },

  qrWrap: { alignItems: 'center', gap: 4, marginTop: 6 },
  qrCaption: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },

  instructions: { color: '#5b6b80', fontSize: 7, lineHeight: 10, textAlign: 'center', marginTop: 8 },

  signatureWrap: { alignItems: 'center', marginTop: 8, gap: 2 },
  signatureCaption: { color: '#5b6b80', fontSize: 7, fontWeight: '600' },

  footerBar: { height: 12 },
});
