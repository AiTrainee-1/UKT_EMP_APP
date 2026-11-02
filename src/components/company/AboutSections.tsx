import React, { memo, useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  ABOUT_PARAGRAPHS,
  buildStats,
  CERT_NOTE,
  CERTIFICATIONS,
  CLIENTS,
  CLIENTS_NOTE,
  CONTACT,
  FOUNDED_YEAR,
  GROUP_COMPANIES,
  mapsUrl,
  MARQUEE_BACK_WORDS,
  MARQUEE_WORDS,
  MOTTO,
  PEOPLE,
  PEOPLE_INTRO,
  PROCESS,
  QUALITY_TEXT,
  SEGMENTS,
  STICKERS,
  VISION,
} from '../../lib/companyProfile';
import { openContactAction } from '../../lib/openContact';
import { ACCENT, createFontStyles, SKIN } from './aboutSkin';
import { CountUp, Marquee, PressCard, RevealItem, Section, ThreadParticles, useScroll } from './AboutMotion';
import {
  ChainLink,
  Glow,
  OutlinedWordmark,
  ProcessThread,
  QualityIcon,
  Rings,
  Seal,
  SegmentIcon,
  StitchLine,
} from './AboutVisuals';
import { Chip, Eyebrow, Heading, openWebLink, Para, Pill } from './CompanyBits';

const GUTTER = 20;
/** Colour blocks float 8 px in from the screen edges. */
const BLOCK_INSET = 8;
const BLOCK_PAD = 22;

const useStyles = createFontStyles((f) =>
  StyleSheet.create({
    // ─── shared ───
    block: { marginHorizontal: BLOCK_INSET, borderRadius: 30, paddingHorizontal: BLOCK_PAD, paddingVertical: 34, overflow: 'hidden' },
    darkSection: { paddingHorizontal: GUTTER, paddingVertical: 40, overflow: 'hidden' },
    mono: { fontFamily: f.mono, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
    gap8: { height: 8 },
    gap14: { height: 14 },
    gap22: { height: 22 },

    // ─── hero ───
    hero: { paddingHorizontal: GUTTER, paddingTop: 14, paddingBottom: 34, overflow: 'hidden' },
    // Vertical room for the tilted corners.
    stickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 8 },
    sticker: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(14,9,41,0.55)' },
    stickerText: { fontFamily: f.mono, fontSize: 12, letterSpacing: 0.6 },
    heroIntro: { marginTop: 16 },
    heroButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },

    // ─── stats ───
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(252,240,214,0.22)', marginTop: 14 },
    statCell: { width: '50%', paddingVertical: 18, paddingHorizontal: 12, borderColor: 'rgba(252,240,214,0.22)' },
    statNumRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'nowrap' },
    statNum: { fontFamily: f.display, letterSpacing: -1, fontVariant: ['tabular-nums'] },
    statSuffix: { fontFamily: f.display, fontSize: 17, marginLeft: 2 },
    statCaption: { fontFamily: f.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, color: SKIN.faintOnDark, marginTop: 6, textTransform: 'uppercase' },

    // ─── tapes ───
    tapes: { height: 168, overflow: 'hidden' },
    tape: { position: 'absolute', left: -60, right: -60, height: 60, justifyContent: 'center' },
    tapeItem: { flexDirection: 'row', alignItems: 'center' },
    tapeText: { fontFamily: f.display, fontSize: 28, letterSpacing: -0.4, paddingHorizontal: 16 },
    tapeSep: { width: 11, height: 11, borderRadius: 6, borderWidth: 2.5 },

    // ─── about ───
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    groupLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },

    // ─── process ───
    hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: GUTTER },
    processRow: { paddingHorizontal: GUTTER, paddingTop: 40, paddingBottom: 6, gap: 14 },
    stepCard: { flex: 1, borderRadius: 24, borderWidth: 1, borderColor: SKIN.hairDark, backgroundColor: SKIN.glass, padding: 18, paddingTop: 30 },
    stepNo: { fontFamily: f.display, fontSize: 52, lineHeight: 56, color: SKIN.butter, letterSpacing: -2 },
    stepTitle: { fontFamily: f.displaySemi, fontSize: 21, lineHeight: 26, color: SKIN.cream, marginTop: 8 },
    stepBody: { fontFamily: f.body, fontSize: 14, lineHeight: 21, color: SKIN.mutedOnDark, marginTop: 8 },
    stepFoot: { fontFamily: f.mono, fontSize: 12, color: SKIN.faintOnDark, marginTop: 14, letterSpacing: 1 },

    // ─── segments ───
    tile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 14, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(252,240,214,0.2)', backgroundColor: 'rgba(1,11,19,0.22)' },
    tileIcon: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(252,240,214,0.08)', borderWidth: 1, borderColor: 'rgba(252,240,214,0.16)' },
    tileTitle: { fontFamily: f.display, fontSize: 30, lineHeight: 34, color: SKIN.cream, letterSpacing: -0.6 },
    tileCaption: { fontFamily: f.body, fontSize: 14, lineHeight: 20, color: 'rgba(252,240,214,0.84)', marginTop: 2 },
    tileTag: { fontFamily: f.mono, fontSize: 12, letterSpacing: 1, color: SKIN.butter },

    // ─── quality ───
    chainCard: { marginTop: 22, borderRadius: 24, borderWidth: 1, borderColor: SKIN.hairDark, backgroundColor: SKIN.glass, paddingVertical: 18, paddingHorizontal: 14 },
    chainRow: { flexDirection: 'row', alignItems: 'flex-start' },
    chainNode: { alignItems: 'center', width: 84 },
    chainCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: SKIN.glassStrong, borderWidth: 1, borderColor: SKIN.hairDark },
    chainLabel: { fontFamily: f.mono, fontSize: 12, color: SKIN.cream, marginTop: 8, letterSpacing: 0.6, textAlign: 'center' },
    chainLinkWrap: { flex: 1, marginTop: 26 },
    chainCaption: { fontFamily: f.body, fontSize: 13, lineHeight: 19, color: SKIN.faintOnDark, marginTop: 12, textAlign: 'center' },

    // ─── people ───
    peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
    welfare: { borderRadius: 20, borderWidth: 1, borderColor: SKIN.hairCream, backgroundColor: SKIN.creamCard, padding: 14, paddingTop: 0, overflow: 'hidden', flex: 1 },
    welfareRule: { height: 3, width: 44, backgroundColor: SKIN.crimson, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginBottom: 12 },
    welfareTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    welfareNo: { fontFamily: f.display, fontSize: 26, lineHeight: 30, color: SKIN.crimson, letterSpacing: -0.8 },
    welfareTitle: { fontFamily: f.displaySemi, fontSize: 17, lineHeight: 21, color: SKIN.ink, marginTop: 10 },
    welfareBody: { fontFamily: f.body, fontSize: 13, lineHeight: 19, color: SKIN.inkMuted, marginTop: 6 },

    // ─── vision ───
    visionRow: { flexDirection: 'row', gap: 16, paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(252,240,214,0.22)' },
    visionNo: { fontFamily: f.display, fontSize: 34, lineHeight: 36, width: 50, letterSpacing: -1 },
    visionText: { flex: 1, fontFamily: f.body, fontSize: 16, lineHeight: 24, color: SKIN.cream },
    motto: { marginTop: 10, borderRadius: 26, backgroundColor: SKIN.butter, padding: 22 },
    mottoText: { ...f.serifItalic, fontSize: 28, lineHeight: 34, color: SKIN.ink, marginTop: 10 },

    // ─── clients ───
    clientWord: { fontFamily: f.display, fontSize: 30, color: SKIN.cream, letterSpacing: -0.6, paddingHorizontal: 18 },
    clientWordSerif: { ...f.serifItalic, fontSize: 34, color: SKIN.butter, paddingHorizontal: 18 },
    clientSlash: { fontFamily: f.mono, fontSize: 18, color: 'rgba(252,240,214,0.35)' },
    clientGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4, marginTop: 18 },
    clientBand: { marginTop: 22, marginHorizontal: -GUTTER, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(252,240,214,0.22)' },
    clientCaption: { fontFamily: f.mono, fontSize: 12, lineHeight: 18, color: SKIN.faintOnDark, marginTop: 12, letterSpacing: 0.4 },

    // ─── contact ───
    contactCard: { marginTop: 22, borderRadius: 26, borderWidth: 1, borderColor: SKIN.hairDark, backgroundColor: SKIN.glass, padding: 20, gap: 10 },
    contactName: { fontFamily: f.displaySemi, fontSize: 22, color: SKIN.cream, marginTop: 6 },
    address: { fontFamily: f.body, fontSize: 15, lineHeight: 23, color: SKIN.mutedOnDark, marginBottom: 8 },
    help: { marginTop: 14, borderRadius: 24, backgroundColor: SKIN.royal, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76 },
    helpIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: SKIN.butter, alignItems: 'center', justifyContent: 'center' },
    helpQ: { fontFamily: f.body, fontSize: 14, lineHeight: 20, color: 'rgba(252,240,214,0.86)' },
    helpA: { fontFamily: f.bodySemi, fontSize: 15, lineHeight: 21, color: SKIN.butter, marginTop: 2 },

    // ─── footer ───
    footer: { paddingHorizontal: GUTTER, paddingTop: 12, alignItems: 'center' },
    footerLine: { fontFamily: f.display, fontSize: 30, color: SKIN.cream, marginTop: 18, letterSpacing: -0.6 },
    footerAccent: { ...f.serifItalic, fontSize: 34, color: SKIN.butter },
    footerSmall: { fontFamily: f.mono, fontSize: 12, color: SKIN.faintOnDark, marginTop: 10, letterSpacing: 0.4, textAlign: 'center' },
  }),
);

// ─── 1. Hero ───────────────────────────────────────────────────────────────

export const HeroSection = memo(function HeroSection({
  width,
  onStory,
  onContactHr,
}: {
  width: number;
  onStory: () => void;
  onContactHr: () => void;
}) {
  const s = useStyles();
  const size = Math.round(Math.min(46, Math.max(34, width * 0.106)));
  return (
    <Section style={s.hero}>
      <Glow size={380} color={SKIN.blueGlow} opacity={0.55} style={{ left: -150, top: -150 }} />
      {/* Centred just off the right edge, level with the wordmark, so it never sits behind body text. */}
      <Glow size={340} color={SKIN.crimson} opacity={0.38} style={{ right: -190, top: 40 }} />
      <ThreadParticles count={16} />

      <RevealItem index={0} style={s.stickers}>
        {STICKERS.map((st) => (
          <View
            key={st.code}
            style={[s.sticker, { borderColor: ACCENT[st.tone], transform: [{ rotate: `${st.tilt}deg` }] }]}
            accessible
            accessibilityLabel={st.spoken}
          >
            <Text style={[s.stickerText, { color: ACCENT[st.tone] }]}>{`${st.code} — ${st.text}`}</Text>
          </View>
        ))}
      </RevealItem>

      {/* Bleeds 12 px past both screen edges; the wrapper itself is that wide so nothing is clipped while it fades in. */}
      <RevealItem index={1} distance={14} style={{ marginHorizontal: -GUTTER - 12, marginTop: 22 }}>
        <OutlinedWordmark
          word="UKT"
          width={width + 24}
          color="rgba(252,240,214,0.75)"
          fadeTo="rgba(185,188,255,0.12)"
          strokePx={1.3}
        />
      </RevealItem>

      <RevealItem index={2} style={{ marginTop: -Math.round(size * 0.9) }}>
        <Heading lead="Knitwear for the world, " accent="made in Tirupur." size={size} />
      </RevealItem>

      <RevealItem index={3} style={s.heroIntro}>
        <Para>
          {`Since ${FOUNDED_YEAR}, UK Textiles has made knitted garments in Tirupur, the hosiery capital of South India, for a discerning international clientele. A modern, vertically integrated facility: one stop for high-fashion garment manufacturing.`}
        </Para>
      </RevealItem>

      <RevealItem index={4} style={s.heroButtons}>
        <Pill label="Our story" icon="arrow-down" onPress={onStory} accessibilityLabel="Our story: scroll to About us" />
        <Pill
          label="Contact HR"
          variant="outline"
          icon="arrow-top-right"
          onPress={onContactHr}
          accessibilityLabel="Contact HR: open Help and Support"
        />
      </RevealItem>
    </Section>
  );
});

// ─── 2. Stats ──────────────────────────────────────────────────────────────

const STAT_TONES = [SKIN.butter, SKIN.pink, SKIN.peri];

export const StatsSection = memo(function StatsSection({ width }: { width: number }) {
  const s = useStyles();
  // "4,00,000" is 4.41 em wide in the display face: size it to fit its half-width cell on any phone.
  const cellInner = (width - GUTTER * 2) / 2 - 24;
  const longSize = Math.max(22, Math.min(32, Math.floor(cellInner / 4.6)));
  const { still } = useScroll();
  const [started, setStarted] = useState(false);
  const onReveal = useCallback(() => setStarted(true), []);
  // Today's date decides "years since 1993"; computed per visit, never hard-coded.
  const stats = useMemo(() => {
    const all = buildStats(new Date());
    const order = ['pieces', 'years', 'segments', 'embroidery', 'group', 'certs'];
    return order.map((k) => all.find((x) => x.key === k)!).filter(Boolean);
  }, []);
  return (
    <Section style={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 12 }} onReveal={onReveal}>
      <RevealItem index={0}>
        <Eyebrow color={SKIN.peri}>By the numbers</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={s.statsGrid}>
        {stats.map((st, i) => (
          <View
            key={st.key}
            style={[s.statCell, i % 2 === 0 && { borderRightWidth: StyleSheet.hairlineWidth }, i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth }]}
            accessible
            accessibilityLabel={st.spoken}
          >
            <View style={s.statNumRow}>
              <CountUp
                value={st.value}
                started={started}
                still={still}
                style={[
                  s.statNum,
                  st.value >= 100000
                    ? { color: STAT_TONES[i % 3], fontSize: longSize, lineHeight: 44 }
                    : { color: STAT_TONES[i % 3], fontSize: 40, lineHeight: 44 },
                ]}
              />
              {!!st.suffix && <Text style={[s.statSuffix, { color: STAT_TONES[i % 3] }]}>{st.suffix}</Text>}
            </View>
            <Text style={s.statCaption}>{st.caption}</Text>
          </View>
        ))}
      </RevealItem>
    </Section>
  );
});

// ─── 3. Crossing marquee tapes ───────────────────────────────────────────────

function TapeWords({ words, color, sep, textStyle }: { words: string[]; color: string; sep: string; textStyle: StyleProp<TextStyle> }) {
  return (
    <>
      {words.map((w) => (
        <View key={w} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[textStyle, { color }]} numberOfLines={1}>
            {w}
          </Text>
          <View style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 2.5, borderColor: sep }} />
        </View>
      ))}
    </>
  );
}

export const TapesSection = memo(function TapesSection() {
  const s = useStyles();
  return (
    <Section style={s.tapes}>
      <View style={[s.tape, { top: 26, backgroundColor: SKIN.royal, transform: [{ rotate: '4deg' }] }]}>
        <Marquee height={60} speed={22} reverse>
          <TapeWords words={MARQUEE_BACK_WORDS} color={SKIN.cream} sep={SKIN.pink} textStyle={s.tapeText} />
        </Marquee>
      </View>
      <View style={[s.tape, { top: 72, backgroundColor: SKIN.butter, transform: [{ rotate: '-3deg' }] }]}>
        <Marquee height={60} speed={30}>
          <TapeWords words={MARQUEE_WORDS} color={SKIN.ink} sep={SKIN.crimson} textStyle={s.tapeText} />
        </Marquee>
      </View>
    </Section>
  );
});

// ─── 4. About us (cream) ─────────────────────────────────────────────────────

export const AboutSection = memo(function AboutSection({ width, onTop }: { width: number; onTop: (y: number) => void }) {
  const s = useStyles();
  const inner = width - BLOCK_INSET * 2 - BLOCK_PAD * 2;
  return (
    <Section style={[s.block, { backgroundColor: SKIN.cream, marginTop: 8 }]} onTop={onTop}>
      <RevealItem index={0}>
        <Eyebrow surface="cream">About us</Eyebrow>
      </RevealItem>
      <RevealItem index={1} distance={12}>
        <OutlinedWordmark word="YEAR" width={inner} color="rgba(180,0,35,0.55)" strokePx={1.2} style={{ marginTop: 16 }} />
      </RevealItem>
      <RevealItem index={2} style={{ marginTop: -30 }}>
        <Heading lead="Garments made " accent="with care" tail=" in Tirupur." surface="cream" size={34} />
      </RevealItem>
      <RevealItem index={3}>
        <View style={s.gap14} />
        <Para surface="cream" lead>
          {ABOUT_PARAGRAPHS[0]}
        </Para>
        <View style={s.gap14} />
        <Para surface="cream">{ABOUT_PARAGRAPHS[1]}</Para>
        <View style={s.gap14} />
        <Para surface="cream">{ABOUT_PARAGRAPHS[2]}</Para>
      </RevealItem>
      <RevealItem index={4}>
        <StitchLine width={inner} color="rgba(20,15,51,0.35)" style={{ marginTop: 22 }} />
        <View style={s.groupLabelRow}>
          <Text style={[s.mono, { color: SKIN.ink }]} accessibilityRole="header">
            Group companies
          </Text>
          <Text style={[s.mono, { color: SKIN.crimson }]} accessibilityElementsHidden importantForAccessibility="no">
            {`0${GROUP_COMPANIES.length}`}
          </Text>
        </View>
        <View style={s.chips}>
          {GROUP_COMPANIES.map((c, i) => (
            <Chip key={c} label={c} surface="cream" filled={i === 0} />
          ))}
        </View>
      </RevealItem>
    </Section>
  );
});

// ─── 5. How we make it (dark, the process chain) ─────────────────────────────

export const ProcessSection = memo(function ProcessSection({ width }: { width: number }) {
  const s = useStyles();
  const cardW = Math.min(Math.round(width * 0.7), 300);
  const gap = 14;
  return (
    <Section style={{ paddingVertical: 40, overflow: 'hidden' }}>
      <Glow size={300} color={SKIN.blueGlow} opacity={0.35} style={{ right: -140, top: 40 }} />
      <View style={{ paddingHorizontal: GUTTER }}>
        <RevealItem index={0}>
          <Eyebrow>How we make it</Eyebrow>
        </RevealItem>
        <RevealItem index={1} style={{ marginTop: 12 }}>
          <Heading lead="From sample to shipment, " accent="in seven steps." size={32} />
        </RevealItem>
      </View>
      <RevealItem index={2} style={s.hintRow}>
        <Text style={[s.mono, { color: SKIN.faintOnDark }]}>How a garment is made here</Text>
        <Text style={[s.mono, { color: SKIN.butter }]} accessibilityElementsHidden importantForAccessibility="no">
          Swipe →
        </Text>
      </RevealItem>
      <RevealItem index={3}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardW + gap}
          decelerationRate="fast"
          contentContainerStyle={s.processRow}
        >
          {PROCESS.map((p, i) => (
            <PressCard
              key={p.no}
              style={[s.stepCard, { width: cardW }]}
              accessibilityLabel={`Step ${i + 1} of ${PROCESS.length}: ${p.title}. ${p.body}`}
            >
              <Text style={s.stepNo}>{p.no}</Text>
              <Text style={s.stepTitle}>{p.title}</Text>
              <Text style={s.stepBody}>{p.body}</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.stepFoot}>{`STEP ${i + 1} / ${PROCESS.length}`}</Text>
            </PressCard>
          ))}
          <ProcessThread count={PROCESS.length} cardW={cardW} gap={gap} padX={GUTTER} knotY={14} holeY={56} />
        </ScrollView>
      </RevealItem>
    </Section>
  );
});

// ─── 6. What we make (royal indigo) ─────────────────────────────────────────

export const SegmentsSection = memo(function SegmentsSection() {
  const s = useStyles();
  return (
    <Section style={[s.block, { backgroundColor: SKIN.royal }]}>
      <Rings size={300} color="rgba(252,240,214,0.09)" style={{ right: -120, top: -110 }} />
      <RevealItem index={0}>
        <Eyebrow surface="royal">What we make</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={{ marginTop: 12 }}>
        <Heading lead="Knitwear for " accent="all segments." surface="royal" size={34} />
      </RevealItem>
      <RevealItem index={2} style={{ marginTop: 12 }}>
        <Para surface="royal">Our specialisation is knitwear: for men, for women and for children.</Para>
      </RevealItem>
      <View style={{ gap: 12, marginTop: 22 }}>
        {SEGMENTS.map((seg, i) => (
          <RevealItem key={seg.key} index={3 + i}>
            <PressCard style={s.tile} accessibilityLabel={`${seg.title}: ${seg.caption}`}>
              <View style={s.tileIcon}>
                <SegmentIcon kind={seg.key} size={58} color={SKIN.cream} accent={SKIN.butter} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tileTag}>{`SEGMENT 0${i + 1}`}</Text>
                <Text style={s.tileTitle}>{seg.title}</Text>
                <Text style={s.tileCaption}>{seg.caption}</Text>
              </View>
            </PressCard>
          </RevealItem>
        ))}
      </View>
    </Section>
  );
});

// ─── 7. Quality (dark) ────────────────────────────────────────────────────

export const QualitySection = memo(function QualitySection() {
  const s = useStyles();
  return (
    <Section style={s.darkSection}>
      <Glow size={320} color={SKIN.crimson} opacity={0.3} style={{ left: -200, top: 60 }} />
      <RevealItem index={0}>
        <Eyebrow>Quality</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={{ marginTop: 12 }}>
        <Heading lead="Quality is " accent="a way of life." size={34} />
      </RevealItem>
      <RevealItem index={2} style={{ marginTop: 14 }}>
        <Para>{QUALITY_TEXT}</Para>
      </RevealItem>
      <RevealItem index={3}>
        <View style={s.chainCard} accessible accessibilityLabel="Quality checked at every stage, from the yarn to the finished garment">
          <View style={s.chainRow}>
            <View style={s.chainNode}>
              <View style={s.chainCircle}>
                <QualityIcon kind="yarn" size={40} color={SKIN.cream} accent={SKIN.pink} />
              </View>
              <Text style={s.chainLabel}>YARN</Text>
            </View>
            <View style={s.chainLinkWrap}>
              <ChainLink color="rgba(252,240,214,0.45)" />
            </View>
            <View style={s.chainNode}>
              <View style={[s.chainCircle, { borderColor: SKIN.butter }]}>
                <QualityIcon kind="check" size={40} color={SKIN.cream} accent={SKIN.butter} />
              </View>
              <Text style={s.chainLabel}>EVERY STAGE</Text>
            </View>
            <View style={s.chainLinkWrap}>
              <ChainLink color="rgba(252,240,214,0.45)" />
            </View>
            <View style={s.chainNode}>
              <View style={s.chainCircle}>
                <QualityIcon kind="garment" size={40} color={SKIN.cream} accent={SKIN.peri} />
              </View>
              <Text style={s.chainLabel}>GARMENT</Text>
            </View>
          </View>
          <Text style={s.chainCaption}>Trained quality-control staff and the latest testing equipment.</Text>
        </View>
      </RevealItem>
      <RevealItem index={4}>
        <Text style={[s.mono, { color: SKIN.peri, marginTop: 26 }]} accessibilityRole="header">
          Certificates & approvals
        </Text>
        <View style={s.chips}>
          {CERTIFICATIONS.map((c) => (
            <Chip key={c} label={c} leading={<Seal size={20} color={SKIN.peri} accent={SKIN.butter} />} />
          ))}
        </View>
        <Para style={{ fontSize: 13.5, lineHeight: 20, marginTop: 14, color: SKIN.faintOnDark }}>{CERT_NOTE}</Para>
      </RevealItem>
    </Section>
  );
});

// ─── 8. Our people (cream) ─────────────────────────────────────────────────

export const PeopleSection = memo(function PeopleSection({ width, onContactHr }: { width: number; onContactHr: () => void }) {
  const s = useStyles();
  const inner = width - BLOCK_INSET * 2 - BLOCK_PAD * 2;
  const cardW = Math.floor((inner - 12) / 2);
  return (
    <Section style={[s.block, { backgroundColor: SKIN.cream }]}>
      <RevealItem index={0}>
        <Eyebrow surface="cream">Our people</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={{ marginTop: 12 }}>
        <Heading lead="Our people " accent="lead us forward." surface="cream" size={34} />
      </RevealItem>
      <RevealItem index={2} style={{ marginTop: 14 }}>
        <Para surface="cream">{PEOPLE_INTRO}</Para>
      </RevealItem>
      <RevealItem index={3} style={s.peopleGrid}>
        {PEOPLE.map((p) => (
          <View key={p.no} style={{ width: cardW }}>
            <PressCard style={s.welfare} outerStyle={{ flex: 1 }} accessibilityLabel={`${p.title}. ${p.body}`}>
              <View style={s.welfareRule} />
              <View style={s.welfareTop}>
                <Text style={s.welfareNo}>{p.no}</Text>
                <MaterialCommunityIcons name={p.icon as any} size={22} color={SKIN.ink} />
              </View>
              <Text style={s.welfareTitle}>{p.title}</Text>
              <Text style={s.welfareBody}>{p.body}</Text>
            </PressCard>
          </View>
        ))}
      </RevealItem>
      <RevealItem index={4} style={{ marginTop: 20 }}>
        <Pill
          label="Ask HR in Help & Support"
          surface="cream"
          icon="arrow-top-right"
          onPress={onContactHr}
          accessibilityLabel="Questions about these facilities? Ask HR in Help and Support"
        />
      </RevealItem>
    </Section>
  );
});

// ─── 9. Vision (dark) ─────────────────────────────────────────────────────

export const VisionSection = memo(function VisionSection() {
  const s = useStyles();
  return (
    <Section style={s.darkSection}>
      <RevealItem index={0}>
        <Eyebrow>Vision</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={{ marginTop: 12, marginBottom: 18 }}>
        <Heading lead="Always " accent="raising the bar." size={34} />
      </RevealItem>
      {VISION.map((v, i) => (
        <RevealItem key={i} index={2 + Math.min(i, 2)}>
          <View style={s.visionRow} accessible accessibilityLabel={`${i + 1}. ${v}`}>
            <Text style={[s.visionNo, { color: STAT_TONES[i % 3] }]}>{`0${i + 1}`}</Text>
            <Text style={s.visionText}>{v}</Text>
          </View>
        </RevealItem>
      ))}
      <RevealItem index={4}>
        <View style={s.motto} accessible accessibilityLabel={`Our motto: ${MOTTO.lead}${MOTTO.accent}`}>
          <Text style={[s.mono, { color: SKIN.ink }]}>05 — Our motto</Text>
          <Text style={s.mottoText}>
            {MOTTO.lead}
            <Text style={{ color: SKIN.crimson }}>{MOTTO.accent}</Text>
          </Text>
        </View>
      </RevealItem>
    </Section>
  );
});

// ─── 10. Trusted by (dark) ──────────────────────────────────────────────────

function ClientWords({
  textStyle,
  serifStyle,
  slashStyle,
}: {
  textStyle: StyleProp<TextStyle>;
  serifStyle: StyleProp<TextStyle>;
  slashStyle: StyleProp<TextStyle>;
}) {
  return (
    <>
      {CLIENTS.map((c, i) => (
        <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={i % 2 === 0 ? textStyle : serifStyle} numberOfLines={1}>
            {c}
          </Text>
          <Text style={slashStyle}>/</Text>
        </View>
      ))}
    </>
  );
}

export const ClientsSection = memo(function ClientsSection() {
  const s = useStyles();
  const { reduce } = useScroll();
  return (
    <Section style={s.darkSection}>
      <RevealItem index={0}>
        <Eyebrow>Trusted by</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={{ marginTop: 12 }}>
        <Heading lead="The patronage of " accent="eminent names." size={34} />
      </RevealItem>
      <RevealItem index={2} style={{ marginTop: 14 }}>
        <Para>{CLIENTS_NOTE}</Para>
      </RevealItem>
      <RevealItem index={3}>
        {reduce ? (
          <View style={s.clientGrid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ClientWords textStyle={s.clientWord} serifStyle={s.clientWordSerif} slashStyle={s.clientSlash} />
          </View>
        ) : (
          <View style={s.clientBand}>
            <Marquee height={76} speed={20} reverse>
              <ClientWords textStyle={s.clientWord} serifStyle={s.clientWordSerif} slashStyle={s.clientSlash} />
            </Marquee>
          </View>
        )}
        <Text style={s.clientCaption}>{`Clients include ${CLIENTS.slice(0, -1).join(', ')} and ${CLIENTS[CLIENTS.length - 1]}.`}</Text>
      </RevealItem>
    </Section>
  );
});

// ─── 11. Contact ──────────────────────────────────────────────────────────

export const ContactSection = memo(function ContactSection({ onContactHr }: { onContactHr: () => void }) {
  const s = useStyles();
  const call = useCallback(
    () => void openContactAction({ kind: 'call', verb: 'Call', value: CONTACT.phoneDisplay, url: `tel:${CONTACT.phoneDial}` }),
    [],
  );
  const mail = useCallback(
    () => void openContactAction({ kind: 'email', verb: 'Email', value: CONTACT.email, url: `mailto:${CONTACT.email}` }),
    [],
  );
  const site = useCallback(() => void openWebLink(CONTACT.websiteUrl, 'the website'), []);
  const maps = useCallback(() => void openWebLink(mapsUrl(), 'Maps'), []);
  return (
    <Section style={[s.darkSection, { paddingBottom: 24 }]}>
      <RevealItem index={0}>
        <Eyebrow>Get in touch</Eyebrow>
      </RevealItem>
      <RevealItem index={1} style={{ marginTop: 12 }}>
        <Heading lead="Visit us in " accent="Tirupur." size={34} />
      </RevealItem>
      <RevealItem index={2}>
        <View style={s.contactCard}>
          <View accessible accessibilityLabel={`Head office address: ${CONTACT.name}, ${CONTACT.addressLines.join(', ')}`}>
            <Text style={[s.mono, { color: SKIN.peri }]}>Head office</Text>
            <Text style={s.contactName}>{CONTACT.name}</Text>
            <Text style={s.address}>{CONTACT.addressLines.join('\n')}</Text>
          </View>
          <Pill
            spread
            label={`Call ${CONTACT.phoneDisplay}`}
            leadingIcon="phone"
            icon="arrow-top-right"
            onPress={call}
            accessibilityLabel={`Call the head office on ${CONTACT.phoneDisplay}`}
          />
          <Pill
            spread
            label={CONTACT.email}
            variant="outline"
            leadingIcon="email-outline"
            onPress={mail}
            accessibilityLabel={`Email the company at ${CONTACT.email}`}
          />
          <Pill
            spread
            label={CONTACT.website}
            variant="outline"
            leadingIcon="web"
            role="link"
            onPress={site}
            accessibilityLabel={`Open the website ${CONTACT.website}`}
          />
          <Pill
            spread
            label="Get directions"
            variant="outline"
            leadingIcon="map-marker-radius-outline"
            role="link"
            onPress={maps}
            accessibilityLabel="Get directions to the head office in Maps"
          />
        </View>
      </RevealItem>
      <RevealItem index={3}>
        <PressCard
          style={s.help}
          onPress={onContactHr}
          accessibilityRole="button"
          accessibilityLabel="Questions about your job, pay or leave? Contact HR in Help and Support"
        >
          <View style={s.helpIcon}>
            <MaterialCommunityIcons name="lifebuoy" size={22} color={SKIN.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.helpQ}>Questions about your job, pay or leave?</Text>
            <Text style={s.helpA}>Contact HR in Help & Support</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={SKIN.cream} />
        </PressCard>
      </RevealItem>
    </Section>
  );
});

// ─── 12. Footer ───────────────────────────────────────────────────────────

export const FooterSection = memo(function FooterSection({ width }: { width: number }) {
  const s = useStyles();
  return (
    <Section style={s.footer}>
      <RevealItem index={0}>
        <OutlinedWordmark word="NAME" width={width - GUTTER * 2} color="rgba(252,240,214,0.45)" strokePx={1} />
      </RevealItem>
      <RevealItem index={1}>
        <Text style={s.footerLine} accessibilityLabel="Be in style.">
          {'Be in '}
          <Text style={s.footerAccent}>style.</Text>
        </Text>
      </RevealItem>
      <RevealItem index={2}>
        <Text style={s.footerSmall}>© UK Textiles · Tirupur, Tamil Nadu, India</Text>
      </RevealItem>
    </Section>
  );
});
