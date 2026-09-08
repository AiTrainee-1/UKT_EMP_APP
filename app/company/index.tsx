import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UKTLogo } from '../../src/components/UKTLogo';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import { BorderRadius, Spacing, ClayElevation } from '../../src/constants/theme';
import type { Palette } from '../../src/theme/palettes';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * About UK Textiles.
 *
 * Rebuilt to be exactly two things -who the company is, and what it makes —
 * because that is what an employee opening this page wants. The previous
 * version padded those out with decorative sections and parallax; here the
 * facts carry the page and the only ornament is the hero.
 *
 * Everything below is from uktextiles.in (company, products and contact
 * pages), not invented.
 */

const COMPANY_URL = 'https://uktextiles.in';
const PHONE = '04214300800';
const PHONE_DISPLAY = '0421 430 0800';
const EMAIL = 'uktex@uktex.net';
const ADDRESS =
  'U.K. Textiles, 199-E (New), Sivakami Nagar Main Road,\nA.B. Nagar, Gandhi Nagar Post,\nTirupur – 641603, Tamil Nadu, India';

const heroImg = require('../../assets/company/hero.png');
const garmentImg = require('../../assets/company/product-garment.png');
const fabricImg = require('../../assets/company/product-fabric.png');
const yarnImg = require('../../assets/company/product-yarn.png');

const FACTS: { label: string; value: string; icon: string }[] = [
  { label: 'Established', value: '1993', icon: 'calendar-star' },
  { label: 'Monthly output', value: '400,000 pcs', icon: 'chart-line' },
  { label: 'Based in', value: 'Tirupur', icon: 'map-marker' },
  { label: 'Model', value: 'Vertically integrated', icon: 'source-branch' },
];

const PRODUCTS: { title: string; blurb: string; image: any }[] = [
  {
    title: "Men's Knitwear",
    blurb: 'High-fashion knitted garments for the menswear segment, produced end to end in house.',
    image: garmentImg,
  },
  {
    title: "Women's Apparel",
    blurb: 'Fashion-led knitted womenswear, from styling and sampling through to finished pieces.',
    image: fabricImg,
  },
  {
    title: "Children's Garments",
    blurb: 'Knitted childrenswear built to the same quality and delivery standards as the adult lines.',
    image: yarnImg,
  },
];

const CAPABILITIES: { icon: string; title: string; body: string }[] = [
  {
    icon: 'factory',
    title: 'Vertically integrated',
    body: 'Knitting through to finished garment under one roof, so quality is controlled at every stage rather than inspected at the end.',
  },
  {
    icon: 'server-network',
    title: 'ERP-enabled',
    body: 'Production, workforce and delivery run on connected systems, which is what makes consistent lead times possible at this volume.',
  },
  {
    icon: 'earth',
    title: 'Export focused',
    body: 'Serving international clientele in high-fashion knitwear, with consistent quality and on-time delivery as the operating promise.',
  },
];

export default function CompanyScreen() {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ─── Hero ─── */}
        <View style={styles.hero}>
          <Image source={heroImg} style={styles.heroImg} resizeMode="cover" />
          {/* Scrim, so the wordmark stays legible whatever the photo does. */}
          <LinearGradient
            colors={['rgba(0,31,63,0.15)', 'rgba(0,31,63,0.88)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBody}>
            <UKTLogo size={44} />
            <Text style={styles.heroTitle}>UK Textiles</Text>
            <Text style={styles.heroTag}>
              A one-stop shop for high-fashion garment manufacturing
            </Text>
          </View>
        </View>

        {/* ─── The numbers, before the prose ─── */}
        <View style={styles.factGrid}>
          {FACTS.map((f) => (
            <View key={f.label} style={styles.factCell}>
              <MaterialCommunityIcons name={f.icon as any} size={16} color={C.primary} />
              <Text style={styles.factValue}>{f.value}</Text>
              <Text style={styles.factLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* ─── Who we are ─── */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>WHO WE ARE</Text>
          <Text style={styles.body}>
            Founded in 1993 in Tirupur, South India, UK Textiles manufactures and exports knitted
            garments for the men's, women's and children's segments.
          </Text>
          <Text style={styles.body}>
            The operation is a modern, vertically integrated garment manufacturing facility — around
            400,000 pieces a month, produced on advanced machinery and run on ERP-enabled systems,
            under a visionary and professional management team.
          </Text>
        </View>

        {/* ─── Products ─── */}
        <Text style={styles.heading}>What we make</Text>
        {PRODUCTS.map((p) => (
          <View key={p.title} style={styles.productCard}>
            <Image source={p.image} style={styles.productImg} resizeMode="cover" />
            <View style={styles.productBody}>
              <Text style={styles.productTitle}>{p.title}</Text>
              <Text style={styles.productBlurb}>{p.blurb}</Text>
            </View>
          </View>
        ))}

        {/* ─── How we work ─── */}
        <Text style={styles.heading}>How we work</Text>
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
        <Text style={styles.heading}>Get in touch</Text>
        <View style={styles.card}>
          <Text style={styles.address}>{ADDRESS}</Text>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactBtn}
              activeOpacity={0.75}
              onPress={() => Linking.openURL(`tel:${PHONE}`)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${PHONE_DISPLAY}`}
            >
              <MaterialCommunityIcons name="phone" size={15} color={C.primary} />
              <Text style={styles.contactText}>{PHONE_DISPLAY}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactBtn}
              activeOpacity={0.75}
              onPress={() => Linking.openURL(`mailto:${EMAIL}`)}
              accessibilityRole="button"
              accessibilityLabel={`Email ${EMAIL}`}
            >
              <MaterialCommunityIcons name="email-outline" size={15} color={C.primary} />
              <Text style={styles.contactText}>{EMAIL}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.siteBtn}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(COMPANY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Open uktextiles.in"
          >
            <MaterialCommunityIcons name="open-in-new" size={15} color={C.onPrimary} />
            <Text style={styles.siteBtnText}>Visit uktextiles.in</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>© UK Textiles · Tirupur, Tamil Nadu</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    content: { paddingBottom: 120 },

    hero: { height: 240, justifyContent: 'flex-end' },
    heroImg: { ...StyleSheet.absoluteFill, width: SCREEN_W, height: 240 },
    heroBody: { padding: Spacing.lg, gap: 6 },
    heroTitle: {
      color: '#fff',
      fontSize: 30,
      fontWeight: '900',
      // Negative tracking on large display type -letters read too far apart
      // as they grow, so the bigger the size the tighter it should sit.
      letterSpacing: -0.6,
      marginTop: 4,
    },
    heroTag: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18, maxWidth: 300 },

    factGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: Spacing.base,
      gap: Spacing.sm,
    },
    factCell: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      gap: 3,
      ...ClayElevation.low,
    },
    factValue: { color: C.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
    factLabel: { color: C.textMuted, fontSize: 10.5, fontWeight: '700' },

    heading: {
      color: C.textPrimary,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: -0.3,
      marginTop: Spacing.lg,
      marginBottom: Spacing.sm,
      marginHorizontal: Spacing.base,
    },
    sectionLabel: {
      color: C.textMuted,
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.6,
      marginBottom: 8,
    },

    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      padding: Spacing.base,
      marginHorizontal: Spacing.base,
      gap: 10,
      ...ClayElevation.low,
    },
    body: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },

    productCard: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.sm,
      overflow: 'hidden',
      ...ClayElevation.low,
    },
    productImg: { width: '100%', height: 140 },
    productBody: { padding: Spacing.base, gap: 4 },
    productTitle: { color: C.textPrimary, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
    productBlurb: { color: C.textMuted, fontSize: 12, lineHeight: 17 },

    capRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    capDivider: { borderTopWidth: 1, borderTopColor: C.outlineVariant, paddingTop: 12, marginTop: 2 },
    capIcon: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: C.badgeBlueBg,
      alignItems: 'center', justifyContent: 'center',
    },
    capTitle: { color: C.textPrimary, fontSize: 13.5, fontWeight: '800' },
    capBody: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },

    address: { color: C.textSecondary, fontSize: 12.5, lineHeight: 19 },
    contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    contactBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.bgSurfaceLow,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    contactText: { color: C.textPrimary, fontSize: 12, fontWeight: '700' },
    siteBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: 12,
      marginTop: 2,
    },
    siteBtnText: { color: C.onPrimary, fontSize: 13, fontWeight: '800' },

    footer: {
      textAlign: 'center',
      color: C.textMuted,
      fontSize: 10.5,
      marginTop: Spacing.lg,
    },
  });
