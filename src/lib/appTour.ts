// The app tour shown on Home after sign-in (owner 2026-11-25: a detailed walkthrough of every important feature, shown
// once to existing users too, replayable from Profile). Pure (no React Native), unit-tested in appTour.test.ts.
//
// A step either points at a real element of Home (`anchor`: a spotlight is cut around it and the card sits beside it),
// or is an illustrated card in the middle of the screen for a feature that lives elsewhere (`features`). The steps a
// person sees follow what they can use: Approvals only for a Department Head; Leave, Permission and Casual Leave never
// for a production employee; Compensation only once the profile says staff (src/lib/employmentType.ts).

import { showsForEmployee, type EmploymentGate } from './employmentType.ts';

/** Bumped from v1 (the 3-step tour) so everybody who saw the short one gets the full tour once. */
export const TOUR_SEEN_KEY = 'uktextiles.homeTourSeen.v2';

export type TourAnchorKey =
  | 'menu'
  | 'bell'
  | 'avatar'
  | 'profileCard'
  | 'attendance'
  | 'today'
  | 'punch'
  | 'actions'
  | 'insights'
  | 'tab:attendance'
  | 'tab:shift'
  | 'tab:approvals'
  | 'tab:profile';

/** The colour family of a step's illustration (the screen maps it onto the active palette). */
export type TourTone = 'primary' | 'green' | 'amber' | 'teal' | 'violet' | 'rose' | 'blue';

export interface TourFeature extends EmploymentGate {
  /** A MaterialCommunityIcons name. */
  icon: string;
  title: string;
  text: string;
}

export interface TourStep {
  key: string;
  title: string;
  body: string;
  /** A MaterialCommunityIcons name for the card's badge / illustration. */
  icon: string;
  tone: TourTone;
  /** The Home element the spotlight is cut around. None = a centred, illustrated card. */
  anchor?: TourAnchorKey;
  /** The feature rows of an illustrated card. */
  features?: TourFeature[];
  /** Where to find it: "Menu → On-Duty". */
  where?: string;
  /** Only for a Department Head. */
  managerOnly?: boolean;
  gate?: EmploymentGate;
}

const ALL_STEPS: TourStep[] = [
  {
    key: 'welcome',
    title: 'Welcome to UKTextiles',
    body: 'A quick tour of everything this app does for you. It takes about a minute, and you can skip it any time.',
    icon: 'hand-wave-outline',
    tone: 'primary',
  },
  {
    key: 'menu',
    anchor: 'menu',
    title: 'The menu',
    body: 'Every feature lives here: On-Duty, Outpass, Leave, Salary, Sync and more. Tap it from any main screen.',
    icon: 'menu',
    tone: 'primary',
  },
  {
    key: 'bell',
    anchor: 'bell',
    title: 'Notifications',
    body: 'Approvals, reminders and messages from HR arrive here. A red dot means something is still unread.',
    icon: 'bell-outline',
    tone: 'amber',
  },
  {
    key: 'avatar',
    anchor: 'avatar',
    title: 'Your profile',
    body: 'Your photo opens your Profile: your details, Digital ID, password, dark mode and this tour again.',
    icon: 'account-circle-outline',
    tone: 'blue',
  },
  {
    key: 'profileCard',
    anchor: 'profileCard',
    title: 'Profile & Digital ID',
    body: 'Tap the card for your details. The QR button opens your Digital ID Card to show at the gate.',
    icon: 'qrcode',
    tone: 'blue',
  },
  {
    key: 'attendance',
    anchor: 'attendance',
    title: 'This month at a glance',
    body: 'Working days, present, absent and leave for this month, updated live from your punches.',
    icon: 'calendar-month',
    tone: 'primary',
  },
  {
    key: 'today',
    anchor: 'today',
    title: 'Right now',
    body: 'Your shift, how far into it you are, and today’s punches labelled by what they are.',
    icon: 'clock-time-four-outline',
    tone: 'teal',
  },
  {
    key: 'punch',
    anchor: 'punch',
    title: 'Slide to punch',
    body: 'Slide the button all the way across to punch in or out at your branch (your location is checked). On an On-Duty day it takes you to the On-Duty punch.',
    icon: 'gesture-swipe-right',
    tone: 'green',
  },
  {
    key: 'actions',
    anchor: 'actions',
    title: 'Quick actions',
    body: 'Shortcuts to what you use most. Tap “Show all” to see every action open to you.',
    icon: 'view-grid-outline',
    tone: 'violet',
  },
  {
    key: 'insights',
    anchor: 'insights',
    title: 'My Insights',
    body: 'Your attendance health score, the last 6 months as charts, punctuality, overtime and pay kept vs lost.',
    icon: 'chart-arc',
    tone: 'green',
  },
  {
    key: 'tabAttendance',
    anchor: 'tab:attendance',
    title: 'Attendance',
    body: 'A colour calendar of your month. Tap any day to open its sheet: every punch, late-in or early-out, permissions and HR edits.',
    icon: 'calendar-check-outline',
    tone: 'green',
  },
  {
    key: 'tabShift',
    anchor: 'tab:shift',
    title: 'My Shift',
    body: 'Your shift timings, grace time and lunch break, so you always know when the day starts and ends.',
    icon: 'clock-outline',
    tone: 'amber',
  },
  {
    key: 'tabApprovals',
    anchor: 'tab:approvals',
    managerOnly: true,
    title: 'Approvals',
    body: 'As a Department Head you approve or reject your team’s requests here. The badge shows how many are waiting for you.',
    icon: 'clipboard-check-outline',
    tone: 'rose',
  },
  {
    key: 'tabProfile',
    anchor: 'tab:profile',
    title: 'Profile',
    body: 'Your details, Digital ID, change password, dark mode, help and sign out.',
    icon: 'account-circle-outline',
    tone: 'blue',
  },
  {
    key: 'onDuty',
    title: 'On-Duty days',
    body: 'Working away from the branch today? Send an On-Duty request and work from that moment.',
    icon: 'briefcase-outline',
    tone: 'amber',
    where: 'Menu → On-Duty',
    features: [
      { icon: 'send-outline', title: 'Ask for On-Duty', text: 'Say where you are going and why.' },
      { icon: 'camera-marker-outline', title: 'Punch with photo & location', text: 'Each punch takes a photo and your place.' },
      { icon: 'qrcode-scan', title: 'Gate pass', text: 'A gate pass with its QR is made when you send it.' },
      { icon: 'map-marker-path', title: 'Your journey', text: 'See the route recorded for your On-Duty days.' },
    ],
  },
  {
    key: 'outpass',
    title: 'Outpass & Tea Break',
    body: 'Stepping out during work, or taking a tea break, is recorded on one screen.',
    icon: 'exit-run',
    tone: 'teal',
    where: 'Menu → Outpass',
    features: [
      { icon: 'exit-run', title: 'Gate outpass', text: 'Ask to go out, show the QR at the gate, and come back in.' },
      { icon: 'coffee-outline', title: 'Tea break', text: 'Your own tea break QR, and how long each break took.' },
    ],
  },
  {
    key: 'requests',
    title: 'Leave & requests',
    body: 'Ask for time off or fix a punch. Your Department Head and HR approve it, and you follow every step.',
    icon: 'file-document-edit-outline',
    tone: 'violet',
    where: 'Menu → Leave & Requests',
    features: [
      { icon: 'umbrella-outline', title: 'Leave', text: 'A full day, several days or half a day.', staffOnly: true },
      { icon: 'hand-wave-outline', title: 'Permission', text: 'Come in late, leave early, or step out for an hour.', staffOnly: true },
      { icon: 'fingerprint', title: 'Missing Punch', text: 'Forgot to punch? Ask HR to add it.' },
      { icon: 'calendar-star', title: 'Casual Leave', text: 'Your paid Casual Leave days for the year.', staffOnly: true },
    ],
  },
  {
    key: 'pay',
    title: 'Salary & Compensation',
    body: 'See what you earned, what attendance cost you, and claim what you are owed.',
    icon: 'cash-multiple',
    tone: 'green',
    where: 'Menu → Salary Slips',
    features: [
      { icon: 'cash-multiple', title: 'Salary slips', text: 'Every slip, explained step by step.' },
      { icon: 'bank-transfer', title: 'Advances & Loans', text: 'Ask for an advance and follow its repayments.' },
      {
        icon: 'briefcase-clock-outline',
        title: 'Compensation',
        text: 'Overtime allowances, birthday and relaxation days.',
        staffProfileOnly: true,
      },
    ],
  },
  {
    key: 'help',
    title: 'Enquiries & offline Sync',
    body: 'Help when you need it, and the app keeps working without internet.',
    icon: 'cloud-sync-outline',
    tone: 'blue',
    where: 'Menu → Enquiries / Sync',
    features: [
      { icon: 'message-question-outline', title: 'Enquiries', text: 'Ask HR a question and follow the reply.' },
      { icon: 'cloud-sync-outline', title: 'Sync', text: 'What you do offline is saved on the phone and sent when you are back online.' },
    ],
  },
  {
    key: 'done',
    title: 'You’re all set!',
    body: 'Replay this tour any time from Profile → Replay app tour.',
    icon: 'check-decagram',
    tone: 'green',
  },
];

export interface TourAudience {
  isManager: boolean;
  /** 'staff' | 'production' | undefined while the profile loads. */
  employmentType?: string | null;
}

/** The steps this person sees, in order, with their feature rows filtered the same way. */
export function buildTour({ isManager, employmentType }: TourAudience): TourStep[] {
  return ALL_STEPS.filter((s) => (!s.managerOnly || isManager) && showsForEmployee(s.gate ?? {}, employmentType))
    .map((s) => (s.features ? { ...s, features: s.features.filter((f) => showsForEmployee(f, employmentType)) } : s))
    .map((s) => {
      const has = (title: string) => !!s.features?.some((f) => f.title === title);
      // A production employee has no Leave / Permission / Casual Leave: that card is about Missing Punch only.
      if (s.key === 'requests' && s.features && !has('Leave')) {
        return {
          ...s,
          title: 'Missing Punch',
          body: 'Forgot to punch? Ask HR to add it. Your Department Head and HR approve it, and you follow every step.',
          where: 'Menu → Missing Punch',
        };
      }
      // Compensation only once the profile says staff: until then the card is about pay alone.
      if (s.key === 'pay' && !has('Compensation')) {
        return {
          ...s,
          title: 'Salary & Advances',
          body: 'See what you earned, what attendance cost you, and ask for an advance when you need one.',
        };
      }
      return s;
    })
    .filter((s) => !s.features || s.features.length > 0);
}

// ── geometry ────────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The tab bar's buttons, left to right, as app/(tabs)/_layout.tsx draws them. */
export function visibleTabs(isManager: boolean): string[] {
  return isManager ? ['home', 'attendance', 'shift', 'approvals', 'profile'] : ['home', 'attendance', 'shift', 'profile'];
}

/**
 * Where a tab button is: the bar starts at the bottom of the screen's content (`content`, measured in the window) and
 * its buttons share its width equally. null for a tab this person does not have.
 */
export function tabRect(content: Rect, tab: string, isManager: boolean, barHeight: number): Rect | null {
  const tabs = visibleTabs(isManager);
  const i = tabs.indexOf(tab);
  if (i < 0 || content.width <= 0) return null;
  const w = content.width / tabs.length;
  return { x: content.x + i * w, y: content.y + content.height, width: w, height: barHeight };
}

/** The spotlight hole: the element plus `pad` on every side, kept inside the screen. */
export function spotlightRect(anchor: Rect, pad: number, screen: { width: number; height: number }): Rect {
  const x = Math.max(4, anchor.x - pad);
  const y = Math.max(4, anchor.y - pad);
  const right = Math.min(screen.width - 4, anchor.x + anchor.width + pad);
  const bottom = Math.min(screen.height - 4, anchor.y + anchor.height + pad);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * Where the card goes beside a spotlight: below it when it fits there (or there is more room below), else above;
 * always kept on the screen between `top` and `bottom` (the safe area). Returns the card's top edge.
 */
export function cardTop(
  hole: Rect,
  cardHeight: number,
  screen: { top: number; bottom: number },
  gap = 14,
): { top: number; side: 'below' | 'above' } {
  const below = screen.bottom - (hole.y + hole.height + gap);
  const above = hole.y - gap - screen.top;
  const side: 'below' | 'above' = below >= cardHeight || below >= above ? 'below' : 'above';
  const raw = side === 'below' ? hole.y + hole.height + gap : hole.y - gap - cardHeight;
  const top = Math.max(screen.top, Math.min(raw, screen.bottom - cardHeight));
  return { top, side };
}

/** "Step 3 of 18" and the progress bar's fill (0-1). */
export function tourProgress(index: number, total: number): { label: string; ratio: number } {
  const n = Math.max(1, total);
  const i = Math.max(0, Math.min(index, n - 1));
  return { label: `Step ${i + 1} of ${n}`, ratio: (i + 1) / n };
}
