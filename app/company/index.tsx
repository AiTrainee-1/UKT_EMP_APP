import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Platform, StatusBar, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import { UKTLogo } from '../../src/components/UKTLogo';
import { Reveal } from '../../src/components/Reveal';
import { SectionTitle, ContactRow, openWebLink } from '../../src/components/company/CompanyBits';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import type { Palette } from '../../src/theme/palettes';
import { openContactAction } from '../../src/lib/openContact';
import { useReduceMotion } from '../../src/lib/motionPrefs';

/**
 * About UK Textiles — every fact below is from uktextiles.in (company,
 * products and contact pages), not invented.
 */

const COMPANY_URL = 'https://uktextiles.in';
const PHONE = '04214300800';
const PHONE_DISPLAY = '0421 430 0800';
const EMAIL = 'uktex@uktex.net';
const ADDRESS_LINES = [
  'U.K. Textiles, 199-E (New), Sivakami Nagar Main Road',
  'A.B. Nagar, Gandhi Nagar Post',
  'Tirupur – 641603, Tamil Nadu, India',
];
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS_LINES.join(', '))}`;
const ESTABLISHED = '1993';

const heroImg = require('../../assets/company/hero.png');
const garmentImg = require('../../assets/company/product-garment.png');
const fabricImg = require('../../assets/company/product-fabric.png');
const yarnImg = require('../../assets/company/product-yarn.png');

const FACTS: { label: string; value: string; sub: string; icon: string }[] = [
  { label: 'Established', value: ESTABLISHED, sub: '30+ years of heritage', icon: 'calendar-star' },
  { label: 'Monthly output', value: '400,000', sub: 'knitted garments', icon: 'chart-line' },
  { label: 'Based in', value: 'Tirupur', sub: 'Tamil Nadu, India', icon: 'map-marker-outline' },
  { label: 'Model', value: 'Integrated', sub: 'fibre to finished', icon: 'source-branch' },
];

const PRODUCTS: { title: string; tag: string; blurb: string; image: number }[] = [
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
    title: 'Vertically integrated',
    body: 'Knitting through to finished garment under one roof, so quality is controlled at every stage rather than inspected at the end.',
  },
  {
    icon: 'server-network',
    title: 'ERP-enabled operations',
    body: 'Production, workforce and delivery run on connected systems, which is what makes consistent lead times possible at this volume.',
  },
  {
    icon: 'earth',
    title: 'Export focused',
    body: 'Serving international clientele in high-fashion knitwear, with consistent quality and on-time delivery as the operating promise.',
  },
];

export default function CompanyScreen() {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const productW = Math.min(Math.round(width * 0.74), 320);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} accessibilityRole="header">About UK Textiles</Text>
          <Text style={styles.headerSubtitle}>Who we are and what we make</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ─── Hero ─── */}
        <View style={styles.hero}>
          <MotiView
            style={StyleSheet.absoluteFill}
            from={{ scale: 1 }}
            animate={{ scale: reduceMotion ? 1 : 1.08 }}
            transition={
              reduceMotion
                ? { type: 'timing', duration: 0 }
                : { type: 'timing', duration: 14000, loop: true, repeatReverse: true }
            }
          >
            <Image
              source={heroImg}
              style={styles.heroImg}
              resizeMode="cover"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Illustration of a textile workshop with looms, yarn and fabric rolls"
            />
          </MotiView>
          <LinearGradient
            colors={['rgba(15,23,42,0.05)', 'rgba(15,23,42,0.35)', 'rgba(15,23,42,0.92)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <UKTLogo size={18} />
              <Text style={styles.heroBadgeText}>UKTEXTILES</Text>
            </View>
            {/* A plain fact, not a live status: the old green "Active" dot read like one. */}
            <View style={styles.heroSince}>
              <MaterialCommunityIcons name="calendar-check-outline" size={13} color="#fff" />
              <Text style={styles.heroSinceText}>Since {ESTABLISHED}</Text>
            </View>
          </View>
          <MotiView
            style={styles.heroBody}
            from={{ opacity: 0, translateY: reduceMotion ? 0 : 14 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 420, delay: 120 }}
          >
            <Text style={styles.heroTitle}>UK Textiles</Text>
            <Text style={styles.heroTag}>A one-stop shop for high-fashion garment manufacturing</Text>
            <View style={styles.heroPlace}>
              <MaterialCommunityIcons name="map-marker" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroPlaceText}>Tirupur, Tamil Nadu · Knitwear exporter</Text>
            </View>
          </MotiView>
        </View>

        {/* ─── Facts ─── */}
        <View style={styles.factGrid}>
          {FACTS.map((f, i) => (
            <Reveal key={f.label} index={i} style={styles.factCellWrap}>
              <View style={styles.factCell} accessible accessibilityLabel={`${f.label}: ${f.value}, ${f.sub}`}>
                <View style={styles.factIconWrap}>
                  <MaterialCommunityIcons name={f.icon as any} size={16} color={C.primary} />
                </View>
                <Text style={[styles.factValue, TabularNums]} numberOfLines={1} adjustsFontSizeToFit>
                  {f.value}
                </Text>
                <Text style={styles.factLabel}>{f.label}</Text>
                <Text style={styles.factSub}>{f.sub}</Text>
              </View>
            </Reveal>
          ))}
        </View>

        {/* ─── Who we are ─── */}
        <Reveal index={4}>
          <View style={[styles.card, styles.storyCard]}>
            <View style={styles.storyAccent} />
            <Text style={styles.storyKicker}>WHO WE ARE</Text>
            <Text style={styles.storyLead}>
              Founded in {ESTABLISHED} in Tirupur, UK Textiles makes and exports knitted garments for men, women and
              children.
            </Text>
            <Text style={styles.body}>
              The operation is a modern, vertically integrated garment manufacturing facility — around 400,000 pieces a
              month, produced on advanced machinery and run on ERP-enabled systems, under a visionary and professional
              management team.
            </Text>
          </View>
        </Reveal>

        {/* ─── What we make ─── */}
        <SectionTitle icon="tshirt-crew-outline" title="What we make" hint="Swipe for more" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={productW + 12}
          decelerationRate="fast"
          contentContainerStyle={styles.productRow}
        >
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.title} index={i + 5}>
              <View
                style={[styles.productCard, { width: productW }]}
                accessible
                accessibilityLabel={`${p.title}. ${p.blurb}`}
              >
                <View>
                  <Image
                    source={p.image}
                    style={styles.productImg}
                    resizeMode="cover"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <View style={styles.productTagPill}>
                    <Text style={styles.productTagText}>{p.tag}</Text>
                  </View>
                </View>
                <View style={styles.productBody}>
                  <Text style={styles.productTitle}>{p.title}</Text>
                  <Text style={styles.productBlurb}>{p.blurb}</Text>
                </View>
              </View>
            </Reveal>
          ))}
        </ScrollView>

        {/* ─── How we work ─── */}
        <SectionTitle icon="cog-outline" title="How we work" />
        <Reveal index={8}>
          <View style={styles.card}>
            {CAPABILITIES.map((c, i) => (
              <View key={c.title} style={styles.capRow}>
                <View style={styles.capRail}>
                  <View style={styles.capIcon}>
                    <MaterialCommunityIcons name={c.icon as any} size={18} color={C.onPrimary} />
                  </View>
                  {i < CAPABILITIES.length - 1 && <View style={styles.capLine} />}
                </View>
                <View style={[styles.capText, i < CAPABILITIES.length - 1 && { paddingBottom: 16 }]}>
                  <Text style={styles.capTitle}>{c.title}</Text>
                  <Text style={styles.capBody}>{c.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </Reveal>

        {/* ─── Contact ─── */}
        <SectionTitle icon="office-building-marker-outline" title="Head office" hint="Company contact" />
        <Reveal index={9}>
          <View style={styles.card}>
            <View style={styles.addressRow} accessible accessibilityLabel={`Address: ${ADDRESS_LINES.join(', ')}`}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color={C.textMuted} />
              <Text style={styles.address}>{ADDRESS_LINES.join('\n')}</Text>
            </View>
            <ContactRow
              tone="primary"
              icon="phone"
              title="Call head office"
              value={PHONE_DISPLAY}
              accessibilityLabel={`Call head office on ${PHONE_DISPLAY}`}
              onPress={() => void openContactAction({ kind: 'call', verb: 'Call', value: PHONE_DISPLAY, url: `tel:${PHONE}` })}
            />
            <ContactRow
              icon="email-outline"
              title="Email the company"
              value={EMAIL}
              accessibilityLabel={`Email the company at ${EMAIL}`}
              onPress={() => void openContactAction({ kind: 'email', verb: 'Email', value: EMAIL, url: `mailto:${EMAIL}` })}
            />
            <ContactRow
              icon="map-marker-radius-outline"
              title="Get directions"
              value="Opens in Maps"
              accessibilityLabel="Get directions to the head office in Maps"
              link
              onPress={() => void openWebLink(MAPS_URL, 'Maps')}
            />
            <ContactRow
              icon="web"
              title="Visit the website"
              value="uktextiles.in"
              accessibilityLabel="Open the website uktextiles.in"
              link
              onPress={() => void openWebLink(COMPANY_URL, 'the website')}
            />
          </View>
        </Reveal>

        <Reveal index={10}>
          <Pressable
            onPress={() => router.push('/help')}
            accessibilityRole="button"
            accessibilityLabel="Questions about your job, pay or leave? Open Help and Support to contact HR"
            style={({ pressed }) => [styles.helpCard, pressed && { opacity: 0.85 }]}
          >
            <MaterialCommunityIcons name="lifebuoy" size={20} color={C.onSecondaryContainer} />
            <Text style={styles.helpText}>
              Questions about your job, pay or leave? <Text style={styles.helpStrong}>Contact HR in Help & Support</Text>
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.onSecondaryContainer} />
          </Pressable>
        </Reveal>

        <Text style={styles.footer}>© UK Textiles · Tirupur, Tamil Nadu</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.bgSurfaceLow,
    },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
    headerSubtitle: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, marginTop: 1 },

    content: { paddingBottom: 48 },

    hero: { height: 250, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: '#0F172A' },
    heroImg: { width: '100%', height: '100%' },
    heroTopRow: {
      position: 'absolute',
      top: 14,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.94)',
      borderRadius: BorderRadius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    heroBadgeText: { color: '#0F172A', fontFamily: FontFamily.bodySemibold, fontSize: 10.5, letterSpacing: 0.6 },
    heroSince: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(15,23,42,0.45)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroSinceText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 11 },
    // Extra bottom room: the fact tiles overlap the hero's lower edge by 18 px.
    heroBody: { padding: Spacing.lg, paddingBottom: 38, gap: 6 },
    heroTitle: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 30, letterSpacing: -0.5 },
    heroTag: { color: 'rgba(255,255,255,0.9)', fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 19, maxWidth: 320 },
    heroPlace: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    heroPlaceText: { color: 'rgba(255,255,255,0.85)', fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },

    factGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: -18, gap: 0 },
    factCellWrap: { width: '50%', padding: 4 },
    factCell: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      gap: 2,
      ...cardShadow,
    },
    factIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: C.badgeBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    factValue: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 19, letterSpacing: -0.3 },
    factLabel: { color: C.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },
    factSub: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 10.5 },

    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginHorizontal: 16,
      gap: 10,
      ...cardShadow,
    },
    storyCard: { marginTop: 14, overflow: 'hidden', paddingLeft: 20 },
    storyAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.secondary },
    storyKicker: { color: C.secondary, fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 1.2 },
    storyLead: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16, lineHeight: 23 },
    body: { color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 20 },

    productRow: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
    productCard: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      ...cardShadow,
    },
    productImg: { width: '100%', height: 150 },
    productTagPill: {
      position: 'absolute',
      left: 10,
      bottom: 10,
      backgroundColor: 'rgba(15,23,42,0.7)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    productTagText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 10.5, letterSpacing: 0.3 },
    productBody: { padding: 14, gap: 4 },
    productTitle: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    productBlurb: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, lineHeight: 18 },

    capRow: { flexDirection: 'row', gap: 12 },
    capRail: { alignItems: 'center', width: 36 },
    capIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    capLine: { flex: 1, width: 2, backgroundColor: C.outlineVariant, marginVertical: 4, borderRadius: 1 },
    capText: { flex: 1, paddingTop: 6 },
    capTitle: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
    capBody: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

    addressRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    address: { flex: 1, color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 20 },

    helpCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 14,
      padding: 14,
      borderRadius: BorderRadius.lg,
      backgroundColor: C.secondaryFixed,
      borderWidth: 1,
      borderColor: C.secondaryContainer,
    },
    helpText: { flex: 1, color: C.onSecondaryContainer, fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 19 },
    helpStrong: { fontFamily: FontFamily.bodySemibold },

    footer: {
      textAlign: 'center',
      color: C.textMuted,
      fontFamily: FontFamily.bodyRegular,
      fontSize: 11,
      marginTop: Spacing.lg,
    },
  });
