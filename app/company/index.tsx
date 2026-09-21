import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import type { Palette } from '../../src/theme/palettes';

/**
 * About UK Textiles — every fact below is from uktextiles.in (company,
 * products and contact pages), not invented.
 */

const COMPANY_URL = 'https://uktextiles.in';
const PHONE = '04214300800';
const PHONE_DISPLAY = '0421 430 0800';
const EMAIL = 'uktex@uktex.net';
const ADDRESS =
  'U.K. Textiles, 199-E (New), Sivakami Nagar Main Road,\nA.B. Nagar, Gandhi Nagar Post,\nTirupur – 641603, Tamil Nadu, India';
const ESTABLISHED = '1993';

const heroImg = require('../../assets/company/hero.png');
const garmentImg = require('../../assets/company/product-garment.png');
const fabricImg = require('../../assets/company/product-fabric.png');
const yarnImg = require('../../assets/company/product-yarn.png');

const FACTS: { label: string; value: string; sub: string; icon: string }[] = [
  { label: 'Established', value: ESTABLISHED, sub: '30+ Years Heritage', icon: 'calendar-star' },
  { label: 'Monthly Output', value: '400,000 pcs', sub: 'Knitted Garments', icon: 'chart-line' },
  { label: 'Based In', value: 'Tirupur, TN', sub: 'Manufacturing Hub', icon: 'map-marker' },
  { label: 'Model', value: 'Integrated', sub: 'Fibre to Finished', icon: 'source-branch' },
];

const PRODUCTS: { title: string; tag: string; blurb: string; image: any }[] = [
  {
    title: "Men's Knitwear",
    tag: 'Menswear',
    blurb: 'High-fashion knitted garments for the menswear segment, produced end to end in house.',
    image: garmentImg,
  },
  {
    title: "Women's Apparel",
    tag: 'Womenswear',
    blurb: 'Fashion-led knitted womenswear, from styling and sampling through to finished pieces.',
    image: fabricImg,
  },
  {
    title: "Children's Garments",
    tag: 'Childrenswear',
    blurb: 'Knitted childrenswear built to the same quality and delivery standards as the adult lines.',
    image: yarnImg,
  },
];

const CAPABILITIES: { icon: string; title: string; body: string }[] = [
  {
    icon: 'factory',
    title: 'Vertically Integrated',
    body: 'Knitting through to finished garment under one roof, so quality is controlled at every stage rather than inspected at the end.',
  },
  {
    icon: 'server-network',
    title: 'ERP-Enabled Operations',
    body: 'Production, workforce and delivery run on connected systems, which is what makes consistent lead times possible at this volume.',
  },
  {
    icon: 'earth',
    title: 'Export Focused',
    body: 'Serving international clientele in high-fashion knitwear, with consistent quality and on-time delivery as the operating promise.',
  },
];

export default function CompanyScreen() {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>About UK Textiles</Text>
          <Text style={styles.headerSubtitle}>Corporate Overview & Manufacturing</Text>
        </View>
        <View style={styles.estPill}>
          <Text style={styles.estPillText}>Est. {ESTABLISHED}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ─── Hero ─── */}
        <View style={styles.hero}>
          <Image source={heroImg} style={styles.heroImg} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(15,23,42,0.15)', 'rgba(15,23,42,0.88)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>XT</Text>
              <Text style={styles.heroBadgeSub}>UKTEXTILES</Text>
            </View>
            <View style={styles.heroStatusPill}>
              <View style={styles.heroStatusDot} />
              <Text style={styles.heroStatusText}>Active</Text>
            </View>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>UK TEXTILES</Text>
            <Text style={styles.heroTag}>A one-stop shop for high-fashion garment manufacturing</Text>
          </View>
        </View>

        {/* ─── Facts grid ─── */}
        <View style={styles.factGrid}>
          {FACTS.map((f) => (
            <View key={f.label} style={styles.factCell}>
              <View style={styles.factIconWrap}>
                <MaterialCommunityIcons name={f.icon as any} size={16} color={C.primary} />
              </View>
              <Text style={[styles.factValue, TabularNums]} numberOfLines={1}>{f.value}</Text>
              <Text style={styles.factLabel}>{f.label}</Text>
              <Text style={styles.factSub}>{f.sub}</Text>
            </View>
          ))}
        </View>

        {/* ─── Who we are ─── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderIcon}>
              <MaterialCommunityIcons name="office-building-outline" size={16} color={C.primary} />
            </View>
            <Text style={styles.cardHeaderTitle}>Who We Are</Text>
          </View>
          <Text style={styles.body}>
            Founded in {ESTABLISHED} in Tirupur, South India, UK Textiles manufactures and exports knitted
            garments for the men's, women's and children's segments.
          </Text>
          <Text style={styles.body}>
            The operation is a modern, vertically integrated garment manufacturing facility — around
            400,000 pieces a month, produced on advanced machinery and run on ERP-enabled systems,
            under a visionary and professional management team.
          </Text>
        </View>

        {/* ─── What we make ─── */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionRowLeft}>
            <View style={styles.cardHeaderIcon}>
              <MaterialCommunityIcons name="tshirt-crew-outline" size={16} color={C.primary} />
            </View>
            <Text style={styles.heading}>What We Make</Text>
          </View>
          <Text style={styles.sectionHint}>Core Divisions</Text>
        </View>
        {PRODUCTS.map((p) => (
          <View key={p.title} style={styles.productCard}>
            <Image source={p.image} style={styles.productImg} resizeMode="cover" />
            <View style={styles.productBody}>
              <View style={styles.productTitleRow}>
                <Text style={styles.productTitle}>{p.title}</Text>
                <View style={styles.productTagPill}>
                  <Text style={styles.productTagText}>{p.tag}</Text>
                </View>
              </View>
              <Text style={styles.productBlurb}>{p.blurb}</Text>
            </View>
          </View>
        ))}

        {/* ─── How we work ─── */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionRowLeft}>
            <View style={styles.cardHeaderIcon}>
              <MaterialCommunityIcons name="cog-outline" size={16} color={C.primary} />
            </View>
            <Text style={styles.heading}>How We Work</Text>
          </View>
        </View>
        <View style={styles.card}>
          {CAPABILITIES.map((c, i) => (
            <View key={c.title} style={[styles.capRow, i > 0 && styles.capDivider]}>
              <View style={styles.capIcon}>
                <MaterialCommunityIcons name={c.icon as any} size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.capTitle}>{c.title}</Text>
                <Text style={styles.capBody}>{c.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ─── Contact ─── */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionRowLeft}>
            <View style={styles.cardHeaderIcon}>
              <MaterialCommunityIcons name="help-circle-outline" size={16} color={C.primary} />
            </View>
            <Text style={styles.heading}>Get in Touch</Text>
          </View>
          <Text style={styles.sectionHint}>Administrative Desk</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.addressRow}>
            <MaterialCommunityIcons name="office-building-marker-outline" size={16} color={C.textMuted} />
            <Text style={styles.address}>{ADDRESS}</Text>
          </View>
          <TouchableOpacity
            style={styles.callBtn}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(`tel:${PHONE}`)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${PHONE_DISPLAY}`}
          >
            <MaterialCommunityIcons name="phone" size={16} color={C.onPrimary} />
            <Text style={styles.callBtnText}>Call Headquarters ({PHONE_DISPLAY})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emailBtn}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(`mailto:${EMAIL}`)}
            accessibilityRole="button"
            accessibilityLabel={`Email ${EMAIL}`}
          >
            <MaterialCommunityIcons name="email-outline" size={15} color={C.primary} />
            <Text style={styles.emailBtnText}>Email Corporate ({EMAIL})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.siteLink}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(COMPANY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Open uktextiles.in"
          >
            <Text style={styles.siteLinkText}>Visit Official Portal (uktextiles.in)</Text>
            <MaterialCommunityIcons name="open-in-new" size={13} color={C.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© UK Textiles · Tirupur, Tamil Nadu</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: C.bgCard,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgSurfaceLow },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
    headerSubtitle: { color: C.textMuted, fontSize: 11.5, marginTop: 1 },
    estPill: { backgroundColor: C.primaryFixed, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
    estPillText: { color: C.primary, fontSize: 10.5, fontWeight: '800' },

    content: { paddingBottom: 120 },

    hero: { height: 210, justifyContent: 'flex-end' },
    heroImg: { ...StyleSheet.absoluteFill },
    heroTopRow: {
      position: 'absolute', top: 14, left: 16, right: 16,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: BorderRadius.md, paddingHorizontal: 10, paddingVertical: 6 },
    heroBadgeText: { color: C.primary, fontFamily: FontFamily.displayBold, fontSize: 11 },
    heroBadgeSub: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 10 },
    heroStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5 },
    heroStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
    heroStatusText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
    heroBody: { padding: Spacing.lg, gap: 6 },
    heroTitle: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 26, letterSpacing: -0.3 },
    heroTag: { color: 'rgba(255,255,255,0.88)', fontSize: 12.5, lineHeight: 18, maxWidth: 300 },

    factGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 8 },
    factCell: {
      flexBasis: '47%', flexGrow: 1,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1, borderColor: C.border,
      padding: 12,
      gap: 3,
      ...cardShadow,
    },
    factIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.badgeBlueBg, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    factValue: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18, letterSpacing: -0.2 },
    factLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '700' },
    factSub: { color: C.textMuted, fontSize: 9.5 },

    heading: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16, letterSpacing: -0.2 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10, marginHorizontal: 16 },
    sectionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionHint: { color: C.textMuted, fontSize: 10.5, fontWeight: '700' },

    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1, borderColor: C.border,
      padding: 16,
      marginHorizontal: 16,
      gap: 10,
      ...cardShadow,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    cardHeaderIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.badgeBlueBg, alignItems: 'center', justifyContent: 'center' },
    cardHeaderTitle: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    body: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },

    productCard: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1, borderColor: C.border,
      marginHorizontal: 16,
      marginBottom: 10,
      overflow: 'hidden',
      ...cardShadow,
    },
    productImg: { width: '100%', height: 130 },
    productBody: { padding: 14, gap: 4 },
    productTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    productTitle: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14.5, letterSpacing: -0.1 },
    productTagPill: { backgroundColor: C.badgeBlueBg, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
    productTagText: { color: C.categoryTracking, fontSize: 9.5, fontWeight: '800' },
    productBlurb: { color: C.textMuted, fontSize: 12, lineHeight: 17 },

    capRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    capDivider: { borderTopWidth: 1, borderTopColor: C.outlineVariant, paddingTop: 12, marginTop: 2 },
    capIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.badgeBlueBg, alignItems: 'center', justifyContent: 'center' },
    capTitle: { color: C.textPrimary, fontSize: 13.5, fontWeight: '800' },
    capBody: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },

    addressRow: { flexDirection: 'row', gap: 8 },
    address: { flex: 1, color: C.textSecondary, fontSize: 12.5, lineHeight: 19 },
    callBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: 13,
      marginTop: 2,
    },
    callBtnText: { color: C.onPrimary, fontSize: 13, fontWeight: '800' },
    emailBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: C.primaryFixed,
      borderRadius: BorderRadius.lg,
      paddingVertical: 12,
    },
    emailBtnText: { color: C.primary, fontSize: 12.5, fontWeight: '700' },
    siteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
    siteLinkText: { color: C.primary, fontSize: 12, fontWeight: '700' },

    footer: {
      textAlign: 'center',
      color: C.textMuted,
      fontSize: 10.5,
      marginTop: Spacing.lg,
    },
  });
