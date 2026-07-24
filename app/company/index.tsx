import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UKTLogo } from '../../src/components/UKTLogo';
import { Colors } from '../../src/constants/colors';
import { BorderRadius, Spacing, ClayElevation } from '../../src/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const COMPANY_URL = 'https://www.uktextiles.in';

const heroImg = require('../../assets/company/hero.png');
const aboutImg = require('../../assets/company/about.png');
const infraImg = require('../../assets/company/infrastructure.png');
const yarnImg = require('../../assets/company/product-yarn.png');
const fabricImg = require('../../assets/company/product-fabric.png');
const garmentImg = require('../../assets/company/product-garment.png');

const stats = [
  { label: 'Years of Excellence', value: '30+' },
  { label: 'Employees', value: '500+' },
  { label: 'Export Countries', value: '20+' },
  { label: 'Products', value: '200+' },
];

const products = [
  {
    title: 'Yarn',
    description:
      'Premium-quality spun and filament yarns crafted for strength, consistency and vibrant colour retention. Suitable for knitting and weaving applications across all textile segments.',
    img: yarnImg,
  },
  {
    title: 'Knitted Fabrics',
    description:
      'State-of-the-art circular and flat-bed knitting machines produce fabrics of superior elasticity and finish. Available in a wide range of GSM, patterns and fibre compositions.',
    img: fabricImg,
  },
  {
    title: 'Garments',
    description:
      'End-to-end garment manufacturing — from cutting and stitching to finishing and packing. Export-quality apparel produced to international standards for global markets.',
    img: garmentImg,
  },
];

const infraPoints = [
  { icon: 'factory', text: 'Modern spinning & knitting plant spread over 2 lakh sq. ft.' },
  { icon: 'flash', text: 'Fully automated production lines with minimal human error' },
  { icon: 'layers-outline', text: 'Integrated operations from fibre to finished garment' },
  { icon: 'truck-outline', text: 'In-house logistics and warehousing for faster dispatch' },
] as const;

const qualityPoints = [
  'ISO 9001:2015 certified quality management system',
  'Rigorous in-process and final inspection at every stage',
  'State-of-the-art testing laboratory with advanced equipment',
  'Compliance with international textile safety standards',
  'Dedicated R&D team for continuous product improvement',
  'Zero-defect culture driven by trained quality personnel',
];

const certifications = [
  { icon: 'shield-check', label: 'ISO 9001:2015' },
  { icon: 'medal-outline', label: 'Export Excellence' },
  { icon: 'star', label: 'Best Quality' },
  { icon: 'earth', label: 'Global Standards' },
] as const;

const clients = [
  'Reliance Retail', 'Arvind Limited', 'Raymond Group', 'Vardhman Textiles',
  'Aditya Birla Fashion', 'Madura Fashion', 'Export Markets', 'Pan-India Distributors',
];

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 500, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

function openWebsite() {
  Linking.openURL(COMPANY_URL).catch(() => {});
}

export default function CompanyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Image source={heroImg} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.65)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroContent}>
            <UKTLogo size={48} />
            <Text style={styles.heroTitle}>
              Weaving Excellence,{'\n'}
              <Text style={styles.heroTitleAccent}>Thread by Thread</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              UK Textiles is a vertically integrated textile manufacturer delivering
              world-class yarn, fabrics and garments to clients across India and beyond.
            </Text>
            <TouchableOpacity style={styles.heroLink} onPress={openWebsite} activeOpacity={0.8}>
              <Text style={styles.heroLinkText}>Visit our website</Text>
              <MaterialCommunityIcons name="open-in-new" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats strip ── */}
        <View style={styles.statsStrip}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── About Us ── */}
        <View style={styles.section}>
          <FadeIn>
            <Text style={styles.eyebrow}>About Us</Text>
            <Text style={styles.sectionTitle}>A Legacy of Textile Innovation</Text>
            <Text style={styles.bodyText}>
              Founded over three decades ago, UK Textiles has grown from a modest spinning
              unit into a fully integrated textile powerhouse. We combine time-tested craft
              with cutting-edge technology to deliver exceptional products that meet the
              demands of a dynamic global market.
            </Text>
            <Text style={[styles.bodyText, { marginTop: Spacing.md }]}>
              Our vertically integrated operations — spanning fibre processing, yarn
              spinning, fabric knitting and garment manufacturing — give us unmatched
              control over quality, cost and lead times.
            </Text>
            <View style={styles.tagRow}>
              {['ISO Certified', 'Export Quality', '30+ Years', 'Pan-India Reach'].map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
          <FadeIn delay={100}>
            <Image source={aboutImg} style={styles.aboutImage} resizeMode="cover" />
          </FadeIn>
        </View>

        {/* ── Products ── */}
        <View style={[styles.section, styles.sectionMuted]}>
          <FadeIn>
            <Text style={styles.eyebrow}>Our Products</Text>
            <Text style={styles.sectionTitle}>From Fibre to Finished Garment</Text>
          </FadeIn>
          {products.map((p, i) => (
            <FadeIn key={p.title} delay={i * 90}>
              <View style={styles.productCard}>
                <Image source={p.img} style={styles.productImage} resizeMode="cover" />
                <View style={styles.productBody}>
                  <Text style={styles.productTitle}>{p.title}</Text>
                  <Text style={styles.productDesc}>{p.description}</Text>
                </View>
              </View>
            </FadeIn>
          ))}
        </View>

        {/* ── Infrastructure ── */}
        <View style={styles.infraSection}>
          <Image source={infraImg} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,100,150,0.87)' }]} />
          <View style={styles.infraContent}>
            <FadeIn>
              <Text style={[styles.eyebrow, { color: Colors.secondaryContainer }]}>Infrastructure</Text>
              <Text style={[styles.sectionTitle, { color: '#fff' }]}>
                Built for Scale. Built for Quality.
              </Text>
            </FadeIn>
            {infraPoints.map((pt, i) => (
              <FadeIn key={pt.text} delay={i * 80}>
                <View style={styles.infraPoint}>
                  <View style={styles.infraIconWrap}>
                    <MaterialCommunityIcons name={pt.icon} size={20} color={Colors.secondaryContainer} />
                  </View>
                  <Text style={styles.infraText}>{pt.text}</Text>
                </View>
              </FadeIn>
            ))}
          </View>
        </View>

        {/* ── Quality ── */}
        <View style={styles.section}>
          <FadeIn>
            <Text style={styles.eyebrow}>Quality</Text>
            <Text style={styles.sectionTitle}>Our Commitment to Excellence</Text>
          </FadeIn>
          {qualityPoints.map((pt, i) => (
            <FadeIn key={pt} delay={i * 60}>
              <View style={styles.qualityRow}>
                <MaterialCommunityIcons name="check-circle" size={18} color={Colors.statusGreen} />
                <Text style={styles.qualityText}>{pt}</Text>
              </View>
            </FadeIn>
          ))}
          <View style={styles.certRow}>
            {certifications.map((c) => (
              <View key={c.label} style={styles.certChip}>
                <MaterialCommunityIcons name={c.icon} size={15} color={Colors.primary} />
                <Text style={styles.certText}>{c.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Clientele ── */}
        <View style={[styles.section, styles.sectionMuted]}>
          <FadeIn>
            <Text style={styles.eyebrow}>Clientele</Text>
            <Text style={styles.sectionTitle}>Trusted by Industry Leaders</Text>
          </FadeIn>
          <View style={styles.clientGrid}>
            {clients.map((client) => (
              <View key={client} style={styles.clientChip}>
                <Text style={styles.clientText}>{client}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── CTA footer ── */}
        <LinearGradient
          colors={['#006496', '#0090d0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cta}
        >
          <MaterialCommunityIcons name="account-group" size={32} color="rgba(255,255,255,0.6)" />
          <Text style={styles.ctaTitle}>Proud to be part of the UK Textiles family</Text>
          <Text style={styles.ctaText}>
            As an employee, you are at the heart of everything we create. Thank you for
            weaving your commitment into every product we make.
          </Text>
          <TouchableOpacity style={styles.ctaButton} onPress={openWebsite} activeOpacity={0.85}>
            <Text style={styles.ctaButtonText}>Learn more at uktextiles.in</Text>
            <MaterialCommunityIcons name="open-in-new" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },

  hero: {
    height: SCREEN_W * 1.15,
    minHeight: 420,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroContent: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    marginTop: Spacing.sm,
  },
  heroTitleAccent: { color: Colors.secondaryContainer },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  heroLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroLinkText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  statsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
  },
  statItem: { width: '50%', alignItems: 'center', paddingVertical: Spacing.sm },
  statValue: { color: '#fff', fontSize: 26, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  section: { padding: Spacing.xl, gap: Spacing.base },
  sectionMuted: { backgroundColor: Colors.bgSurfaceLow },
  eyebrow: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  bodyText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  tag: {
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: Spacing.base,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  tagText: { color: Colors.onPrimaryContainer, fontSize: 11, fontWeight: '700' },
  aboutImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: BorderRadius.xl,
    marginTop: Spacing.sm,
    ...ClayElevation.mid,
  },

  productCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...ClayElevation.low,
  },
  productImage: { width: '100%', aspectRatio: 16 / 10 },
  productBody: { padding: Spacing.base, gap: 4 },
  productTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  productDesc: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 18 },

  infraSection: { paddingVertical: Spacing.xxxl, overflow: 'hidden' },
  infraContent: { paddingHorizontal: Spacing.xl, gap: Spacing.base },
  infraPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  infraIconWrap: {
    width: 38, height: 38, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(254,214,91,0.2)',
  },
  infraText: { flex: 1, color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 19 },

  qualityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  qualityText: { flex: 1, color: Colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  certRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, justifyContent: 'center' },
  certChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.primaryFixed,
    backgroundColor: Colors.bgSurface,
  },
  certText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },

  clientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  clientChip: {
    width: (SCREEN_W - Spacing.xl * 2 - Spacing.sm) / 2,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.sm,
  },
  clientText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '700', textAlign: 'center' },

  cta: { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  ctaTitle: { color: '#fff', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  ctaText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: Spacing.sm,
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  ctaButtonText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
