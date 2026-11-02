// The "About UK Textiles" screen's content and the small pure rules behind its visuals.
// Every fact here is from the company's own website (uktextiles.in, read 2026-11-02), lightly
// edited for clarity - nothing is invented. Pure (unit-tested in companyProfile.test.ts); the
// few helpers that also run inside animations carry the 'worklet' directive, which is a plain
// string statement everywhere else.

export const FOUNDED_YEAR = 1993;

/** Whole calendar years since the company was founded (2026 -> 33). Never negative. */
export function yearsSince(founded: number, now: Date): number {
  return Math.max(0, now.getFullYear() - founded);
}

/** Indian digit grouping: 400000 -> "4,00,000", 1234567 -> "12,34,567". Rounds to a whole number. */
export function formatIndian(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const n = Math.round(Math.abs(value));
  const sign = value < 0 && n > 0 ? '-' : '';
  const digits = String(n);
  if (digits.length <= 3) return sign + digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}${rest},${last3}`;
}

/** Fast start, gentle landing. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** The number a count-up shows at `progress` (0..1): whole numbers, never past the target, exactly the target at the end. */
export function countUpValue(target: number, progress: number): number {
  if (progress >= 1) return target;
  return Math.min(target, Math.floor(target * easeOutCubic(progress)));
}

// ---------------------------------------------------------------------------
// Motion helpers (also run on the UI thread)
// ---------------------------------------------------------------------------

/**
 * A section should reveal once its top edge has come `lead` of the way up the viewport
 * (0.86 = when it is 14% above the bottom edge). `top < 0` means "not laid out yet".
 */
export function revealReached(top: number, scrollY: number, viewportH: number, lead = 0.86): boolean {
  'worklet';
  if (top < 0 || viewportH <= 0) return false;
  return top < scrollY + viewportH * lead;
}

/** True while any part of the band [top, top + height) is on screen. */
export function bandVisible(top: number, height: number, scrollY: number, viewportH: number): boolean {
  'worklet';
  if (top < 0 || height <= 0) return false;
  return top < scrollY + viewportH && top + height > scrollY;
}

/**
 * Horizontal offset of a marquee track made of two identical copies `copyWidth` wide.
 * Left-moving: 0 -> -copyWidth then wraps. Right-moving: -copyWidth -> 0 then wraps.
 * Always within (-copyWidth, 0], so the visible window is never empty.
 */
export function marqueeOffset(seconds: number, pxPerSecond: number, copyWidth: number, reverse = false): number {
  'worklet';
  if (copyWidth <= 0) return 0;
  const travelled = (seconds * pxPerSecond) % copyWidth;
  if (reverse) return travelled === 0 ? 0 : -copyWidth + travelled;
  return travelled === 0 ? 0 : -travelled;
}

export interface Thread {
  /** Left edge as a fraction of the area's width. */
  x: number;
  /** Length of the falling fibre in px. */
  length: number;
  /** Falls per second through the area (0.05 = one fall every 20 s). */
  speed: number;
  /** Where in its fall it starts (0..1). */
  phase: number;
  /** Side-to-side sway in px. */
  sway: number;
  /** Peak opacity. */
  alpha: number;
  /** Which accent its glowing tip uses: 0 butter, 1 periwinkle, 2 pink. */
  tint: 0 | 1 | 2;
}

export const MAX_THREADS = 24;

/** Small deterministic PRNG (mulberry32), so the threads sit in the same places every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The hero's drifting threads: at most MAX_THREADS, spread across the width, slow. */
export function makeThreads(count: number, seed = 1993): Thread[] {
  const n = Math.max(0, Math.min(MAX_THREADS, Math.floor(count)));
  const r = rng(seed);
  const out: Thread[] = [];
  for (let i = 0; i < n; i++) {
    // One per column, jittered inside it, so they never clump.
    const x = (i + 0.15 + r() * 0.7) / n;
    out.push({
      x,
      length: Math.round(14 + r() * 26),
      speed: 0.035 + r() * 0.05,
      phase: r(),
      sway: Math.round(3 + r() * 9),
      alpha: 0.45 + r() * 0.5,
      tint: (i % 3) as 0 | 1 | 2,
    });
  }
  return out;
}

/** Where a thread is at `seconds`: y from just above the area to just below it, a gentle sway and a twinkle. */
export function threadFrame(t: Thread, seconds: number, areaH: number): { x: number; y: number; opacity: number } {
  'worklet';
  const p = (seconds * t.speed + t.phase) % 1;
  const travel = areaH + t.length + 40;
  const y = -t.length - 20 + p * travel;
  const x = Math.sin((seconds * 0.12 + t.phase) * Math.PI * 2) * t.sway;
  const twinkle = 0.6 + 0.4 * Math.sin((seconds * 0.5 + t.phase * 3) * Math.PI * 2);
  // Fade in over the first 10% of the fall and out over the last 10%.
  const edge = Math.min(1, p / 0.1, (1 - p) / 0.1);
  return { x, y, opacity: Math.max(0, t.alpha * twinkle * edge) };
}

// ---------------------------------------------------------------------------
// Content (uktextiles.in)
// ---------------------------------------------------------------------------

export const TAGLINES = [
  'One stop shop for high fashion garment manufacturing',
  'High fashion, value-added garment manufacturers',
  'Modern, vertically integrated garment manufacturing facility',
  'Consistent quality and timely delivery are our focus',
  'Be in style',
] as const;

export const MONTHLY_PIECES = 400000;

export interface Sticker {
  code: string;
  text: string;
  tone: 'butter' | 'peri' | 'pink';
  /** Degrees. */
  tilt: number;
  /** What a screen reader says (the code is decoration). */
  spoken: string;
}

export const STICKERS: Sticker[] = [
  { code: 'N1.01', text: `KNITWEAR SINCE ${FOUNDED_YEAR}`, tone: 'butter', tilt: -4, spoken: `Knitwear since ${FOUNDED_YEAR}` },
  { code: 'N1.02', text: 'TIRUPUR, INDIA', tone: 'peri', tilt: 3, spoken: 'Tirupur, India' },
  {
    code: 'N1.03',
    text: `${formatIndian(MONTHLY_PIECES)} PCS / MONTH`,
    tone: 'pink',
    tilt: -2,
    spoken: `${formatIndian(MONTHLY_PIECES)} pieces a month`,
  },
];

export interface Stat {
  key: string;
  value: number;
  /** Shown after the number, smaller. */
  suffix?: string;
  caption: string;
  /** What a screen reader says (the final figure, never a half-counted one). */
  spoken: string;
}

export function buildStats(now: Date): Stat[] {
  const years = yearsSince(FOUNDED_YEAR, now);
  return [
    { key: 'years', value: years, suffix: ' yrs', caption: `Making knitwear since ${FOUNDED_YEAR}`, spoken: `${years} years making knitwear, since ${FOUNDED_YEAR}` },
    { key: 'pieces', value: MONTHLY_PIECES, caption: 'Pieces made every month', spoken: `Nearly ${formatIndian(MONTHLY_PIECES)} pieces made every month` },
    { key: 'segments', value: 3, caption: 'Segments: men, women, children', spoken: '3 segments: men, women and children' },
    { key: 'embroidery', value: 20, suffix: '-head', caption: 'Tajima embroidery machine', spoken: 'A 20-head Tajima embroidery machine' },
    { key: 'group', value: 3, caption: 'Group companies', spoken: '3 group companies' },
    { key: 'certs', value: 5, caption: 'Certificates & approvals', spoken: '5 certificates and approvals' },
  ];
}

export const MARQUEE_WORDS = ['KNITWEAR', 'MEN', 'WOMEN', 'CHILDREN', 'EMBROIDERY', 'PRINTING', 'VALUE ADDITIONS', 'ON TIME, EVERY TIME'];

export const MARQUEE_BACK_WORDS = ['BE IN STYLE', 'HIGH FASHION', 'VALUE ADDED', 'CONSISTENT QUALITY', 'TIMELY DELIVERY', 'SINCE 1993'];

export const ABOUT_PARAGRAPHS = [
  'The year 1993 saw our inception as a knitted garments manufacturer and exporter. We set up base in Tirupur, the hosiery capital of South India. Located near Coimbatore, Tirupur enjoys easy access to all major towns and cities.',
  'With a state-of-the-art manufacturing facility, we produce some of the finest quality garments for a discerning international clientele. Our specialisation is knitwear for all segments. From the latest ERP-enabled systems to the most advanced machinery, we are equipped to manufacture and export nearly 4,00,000 pieces every month.',
  'Backed by a visionary, dynamic and professional management, we are motivated to excel in each of our endeavours.',
];

export const GROUP_COMPANIES = ['UK Textiles', 'Exult Clothing Company', 'Vyshak Garments'];

export interface ProcessStep {
  no: string;
  title: string;
  body: string;
}

export const PROCESS: ProcessStep[] = [
  { no: '01', title: 'Sampling', body: "An exclusive sampling department develops product samples to each customer's requirements. Production starts on the client-approved sample." },
  { no: '02', title: 'Merchandising', body: 'Our merchandisers follow every step of production and work with customers so their requirements are met.' },
  { no: '03', title: 'Production', body: 'Some of the finest cutting and sewing machinery from around the world, and a needle-detection facility that makes sure every product is metal-free.' },
  { no: '04', title: 'Embroidery', body: 'A highly advanced 20-head Tajima machine for the finest embroidery designs.' },
  { no: '05', title: 'Printing', body: 'Table and machine printing for a wide range of print patterns.' },
  { no: '06', title: 'Value additions', body: 'Embroidery finishes, different washes, sequins and bead work, crochet work and more.' },
  { no: '07', title: 'Logistics', body: "An efficient logistics department dispatches products on time, every time, meeting each customer's specific needs." },
];

export type SegmentKey = 'men' | 'women' | 'children';

export interface Segment {
  key: SegmentKey;
  title: string;
  caption: string;
}

export const SEGMENTS: Segment[] = [
  { key: 'men', title: 'Men', caption: 'Knitted garments for menswear' },
  { key: 'women', title: 'Women', caption: 'Knitted fashion for womenswear' },
  { key: 'children', title: 'Children', caption: 'Knitted garments for childrenswear' },
];

export const QUALITY_TEXT =
  'Quality has always been a way of life at UK Textiles. From procuring the yarn to producing the garment, rigorous quality control is ensured at every stage. A team of trained quality-control staff and the latest testing equipment make sure every product that leaves our premises meets world-class standards.';

export const CERT_NOTE =
  'SA 8000 certifies us as a responsible apparel producer. OEKO-TEX Standard 100 and Sedex certify that our products are free from harmful substances.';

export const CERTIFICATIONS = ['SA 8000', 'OEKO-TEX Standard 100', 'Sedex', 'WRAP', 'Disney'];

export const PEOPLE_INTRO =
  'Our people are not just our backbone; they lead us forward to new goals. We make sure they have a rewarding and satisfying employment with us and a comfortable presence on our premises.';

export interface Welfare {
  no: string;
  title: string;
  body: string;
  /** MaterialCommunityIcons name (a vector icon, not an image). */
  icon: string;
}

export const PEOPLE: Welfare[] = [
  { no: '01', title: 'Baby crèche', body: 'A safe place on the premises to leave your baby while you work.', icon: 'baby-carriage' },
  { no: '02', title: 'Food court', body: 'A spacious food court with clean drinking water and neat dining.', icon: 'silverware-fork-knife' },
  { no: '03', title: 'Medical care', body: 'Immediate medical care whenever it is needed.', icon: 'medical-bag' },
  { no: '04', title: 'NGO awareness', body: 'Awareness campaigns run by NGOs.', icon: 'bullhorn-outline' },
  { no: '05', title: 'Training', body: 'Training sessions that keep everyone updated in their field.', icon: 'school-outline' },
  { no: '06', title: "Women's empowerment", body: "We work with social organisations for women's empowerment and the eradication of child labour.", icon: 'hand-heart-outline' },
];

export const VISION: string[] = [
  'Set a precedent in the global manufacturing industry through continuous innovation, exceptional products, focused services and enhanced customer satisfaction.',
  'Keep a sharp eye on quality and constantly raise the bar.',
  'Comply flawlessly with all statutory regulations our customers require, in any country.',
  "Build and keep a logistics infrastructure of the highest efficiency that blends seamlessly with our customers' own supply chain.",
];

/** The motto, split so the screen can set its last phrase in the accent. */
export const MOTTO = {
  lead: 'The highest standards of quality at the best possible prices, with shipments delivered ',
  accent: 'on time, every time.',
};

export const CLIENTS_NOTE =
  'Over the years we have won the patronage of some of the most eminent names across the globe. Their continued trust motivates us to keep delivering innovation in fashion.';

export const CLIENTS = ['Diesel', 'K&L Ruppert', 's.Oliver', "Levi's", "Marc O'Polo"];

export const CONTACT = {
  name: 'U.K. Textiles',
  addressLines: ['199-E (New), Sivakami Nagar Main Road', 'A.B. Nagar, Gandhi Nagar Post', 'Tirupur – 641603, Tamil Nadu, India'],
  phoneDisplay: '0421 430 0800',
  phoneDial: '04214300800',
  email: 'uktex@uktex.net',
  website: 'uktextiles.in',
  websiteUrl: 'https://uktextiles.in',
};

export function mapsUrl(): string {
  const q = [CONTACT.name, ...CONTACT.addressLines].join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
