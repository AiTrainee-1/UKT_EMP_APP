// The On-Duty page as ONE continuous process, as pure functions: what step the employee is on, which are done, which remain.
//
//   1 Request  ->  2 Approval & tracking  ->  3-6 Geo-punch 1..4  ->  7 Done
//
// The server owns every fact (the session's status, the four punch slots and what was recorded in them); this file only reads
// them into seven steps. Punches can still be recorded in ANY order (a missed punch never blocks a later one, see
// useGeoAttendance.ts): the "current" step is the lowest open slot, every other open slot is `upcoming` but stays recordable.
import { formatClock } from '../tracking/format.ts';
import { istWallClockMs } from '../tracking/geo.ts';

export type StageKey = 'request' | 'approval' | 'punch1' | 'punch2' | 'punch3' | 'punch4' | 'done';

/**
 * done      finished (a check mark)
 * current   what to do now: the one highlighted step with its primary action
 * upcoming  still to come (muted)
 * problem   needs attention (a rejected punch or request)
 * skipped   will not happen (the session ended or was rejected before it)
 */
export type StepState = 'done' | 'current' | 'upcoming' | 'problem' | 'skipped';

export type BadgeTone = 'green' | 'amber' | 'red' | 'grey';

export interface FlowVerification {
  punchDate: string;
  punchTime: string;
  status: 'pending' | 'approved' | 'rejected';
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}

export interface FlowSlot {
  punchNumber: number;
  punchType: 'IN' | 'OUT';
  status: 'available' | 'pending' | 'approved' | 'recorded';
  available: boolean;
  /** The latest verification of this slot (the page keeps the highest id per punch number). */
  verification: FlowVerification | null;
}

export interface FlowSession {
  status: 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';
  destination: string;
  isProvisional: boolean;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionReason: 'manual' | 'auto_4th_punch' | 'auto_day_end' | null;
}

export interface FlowInput {
  session: FlowSession | null;
  slots: FlowSlot[];
  /** The employee is composing a new request (after the last one ended): step 1 is the current one again. */
  composing: boolean;
  /** "Waiting for HR" etc., worded by the screen from the request's approval block (null on an older backend). */
  approvalWaiting: string | null;
  /** How many photos a punch takes now (HR's setting): 1 or 2. */
  photos: 1 | 2;
  /** Is geo-tracking switched on for this employee. */
  trackingOn: boolean;
  /** The route is NOT being recorded right now (the tracking notice is not accepted, location is off ...). */
  trackingProblem: boolean;
}

export interface FlowStep {
  key: StageKey;
  /** 1..7 */
  index: number;
  title: string;
  state: StepState;
  /** One short line under the title. */
  note: string;
  /** "09:07 AM" when the step happened and the time is known. */
  time: string | null;
  /** Where the punch was taken ("11.1085, 77.3411"), when known. */
  place: string | null;
  badge: { label: string; tone: BadgeTone } | null;
  /** Done, but something is wrong with it (the route is not being recorded): drawn with a warning mark instead of a check. */
  warn: boolean;
  /** Punch steps: 1..4. */
  punchNumber: number | null;
  punchType: 'IN' | 'OUT' | null;
  /** A punch step whose slot can be recorded right now (the session is active and the slot is open). */
  recordable: boolean;
}

export interface Flow {
  steps: FlowStep[];
  /** The step with the primary action; null when the process is over (completed / rejected). */
  current: StageKey | null;
  /** 1-based index of the current step (or of the last step reached when it is over). */
  position: number;
  total: 7;
  punchesDone: number;
  /** The lowest open slot the employee can record now, or null. */
  nextPunch: number | null;
  /** "Step 3 of 7", "Completed", "Request rejected". */
  headline: string;
}

const TOTAL = 7;
const PUNCH_KEYS: StageKey[] = ['punch1', 'punch2', 'punch3', 'punch4'];

const VERIFICATION_BADGE: Record<FlowVerification['status'], { label: string; tone: BadgeTone }> = {
  approved: { label: 'Approved', tone: 'green' },
  pending: { label: 'Pending approval', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
};

const COMPLETION_NOTE: Record<string, string> = {
  auto_4th_punch: 'Ended automatically after all 4 punches',
  auto_day_end: 'Ended automatically at the end of the day',
  manual: 'You marked it Done',
};

const coords = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

const step = (partial: Partial<FlowStep> & Pick<FlowStep, 'key' | 'index' | 'title' | 'state'>): FlowStep => ({
  note: '',
  time: null,
  place: null,
  badge: null,
  warn: false,
  punchNumber: null,
  punchType: null,
  recordable: false,
  ...partial,
});

/** Reads the session, the four slots and the form state into the seven steps. */
export function buildFlow(input: FlowInput): Flow {
  const { session, composing } = input;
  const live = !!session && !composing;
  const status = live ? session.status : null;
  const pending = status === 'pending_hod' || status === 'pending_hr';
  const active = status === 'active';
  const completed = status === 'completed';
  const rejected = status === 'rejected';

  const slots = [1, 2, 3, 4].map(
    (n): FlowSlot =>
      input.slots.find((s) => s.punchNumber === n) ?? {
        punchNumber: n,
        punchType: n % 2 === 1 ? 'IN' : 'OUT',
        status: 'available',
        available: true,
        verification: null,
      },
  );

  // ── 1 Request
  const requested = live ? formatClock(session.createdAt ?? session.startedAt) : '';
  const request = !live
    ? step({ key: 'request', index: 1, title: 'Request On-Duty', state: 'current', note: 'Tell us where you are going.' })
    : step({
        key: 'request',
        index: 1,
        title: 'Request On-Duty',
        state: 'done',
        note: session.destination,
        time: requested || null,
      });

  // ── 2 Approval & tracking
  let approval: FlowStep;
  if (!live) {
    approval = step({
      key: 'approval',
      index: 2,
      title: 'Approval & route tracking',
      state: 'upcoming',
      note: input.trackingOn ? 'Your route is recorded from the moment you submit.' : 'Your request goes for approval.',
    });
  } else if (pending) {
    approval = step({
      key: 'approval',
      index: 2,
      title: 'Approval & route tracking',
      state: 'current',
      note: input.approvalWaiting ?? 'Waiting for approval',
    });
  } else if (rejected) {
    approval = step({
      key: 'approval',
      index: 2,
      title: 'Approval & route tracking',
      state: 'problem',
      note: 'Your request was rejected',
      badge: { label: 'Rejected', tone: 'red' },
    });
  } else {
    const tracked = input.trackingOn;
    const note = completed
      ? tracked
        ? 'Route recording has stopped'
        : 'Approved'
      : input.trackingProblem
        ? 'Your route is not being recorded. Fix it now.'
        : session.isProvisional
          ? `${tracked ? 'Route is being recorded. ' : ''}${input.approvalWaiting ?? 'Approval is still pending'}. You can keep punching.`
          : tracked
            ? 'Route is being recorded'
            : 'Approved';
    approval = step({
      key: 'approval',
      index: 2,
      title: 'Approval & route tracking',
      state: 'done',
      note,
      warn: active && input.trackingProblem,
    });
  }

  // ── 3..6 the four geo-punches
  let nextPunch: number | null = null;
  const punches = slots.map((slot) => {
    const n = slot.punchNumber;
    const v = slot.verification;
    const key = PUNCH_KEYS[n - 1];
    const typeLabel = slot.punchType === 'IN' ? 'Check-In' : 'Check-Out';
    const base = { key, index: 2 + n, title: `Geo-punch ${n}`, punchNumber: n, punchType: slot.punchType };

    if (v && v.status !== 'rejected') {
      const at = istWallClockMs(v.punchDate, v.punchTime);
      return step({
        ...base,
        state: 'done',
        note: typeLabel,
        time: at != null ? formatClock(at) : v.punchTime.slice(0, 5),
        place: coords(v.latitude, v.longitude),
        badge: VERIFICATION_BADGE[v.status],
      });
    }
    if (slot.status === 'recorded' && (!v || v.status === 'rejected')) {
      return step({ ...base, state: 'done', note: `${typeLabel} · already recorded` });
    }
    // An open slot (never recorded, or recorded and rejected by HR).
    const wasRejected = !!v && v.status === 'rejected';
    const can = active && slot.available;
    if (can && nextPunch == null) nextPunch = n;
    if (!live || pending) {
      return step({
        ...base,
        state: 'upcoming',
        note: pending
          ? `${typeLabel} · opens once your request is approved`
          : `${typeLabel} · ${input.photos === 2 ? '2 photos' : 'a photo'} and your location`,
      });
    }
    if (completed || rejected) {
      return step({ ...base, state: 'skipped', note: `${typeLabel} · not recorded` });
    }
    return step({
      ...base,
      state: wasRejected ? 'problem' : 'upcoming', // the first open slot is promoted to `current` below
      note: wasRejected ? 'HR rejected this punch. Record it again.' : typeLabel,
      badge: wasRejected ? VERIFICATION_BADGE.rejected : null,
      recordable: can,
    });
  });
  if (nextPunch != null) {
    const cur = punches[nextPunch - 1];
    cur.state = 'current';
  }

  // ── 7 Done
  const filled = punches.filter((p) => p.state === 'done').length;
  let done: FlowStep;
  if (completed) {
    done = step({
      key: 'done',
      index: 7,
      title: 'Done',
      state: 'done',
      note: COMPLETION_NOTE[session!.completionReason ?? ''] ?? 'Journey complete',
      time: formatClock(session!.completedAt) || null,
    });
  } else if (rejected) {
    done = step({ key: 'done', index: 7, title: 'Done', state: 'skipped', note: 'The request was rejected' });
  } else if (active && nextPunch == null) {
    // Nothing left to record: the server closes the session at the 4th punch, this is the moment before it does.
    done = step({ key: 'done', index: 7, title: 'Done', state: 'current', note: 'All 4 punches for today are in. Your session ends and HR will confirm your punches.' });
  } else {
    done = step({
      key: 'done',
      index: 7,
      title: 'Done',
      state: 'upcoming',
      note: 'Ends after punch 4, when you mark it Done, or at the end of the day',
    });
  }

  const steps = [request, approval, ...punches, done];
  const currentStep = steps.find((s) => s.state === 'current') ?? null;
  const last = [...steps].reverse().find((s) => s.state === 'done' || s.state === 'problem');
  const position = currentStep ? currentStep.index : last ? last.index : 1;
  const headline = completed
    ? 'Completed'
    : rejected
      ? 'Request rejected'
      : currentStep
        ? `Step ${currentStep.index} of ${TOTAL}`
        : 'Step 1 of 7';

  return {
    steps,
    current: currentStep ? currentStep.key : null,
    position,
    total: TOTAL,
    punchesDone: filled,
    nextPunch,
    headline,
  };
}
