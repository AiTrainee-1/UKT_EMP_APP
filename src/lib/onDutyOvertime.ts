// Overtime (OT) punches of an On-Duty day (owner 2026-11-24): after the four punches the employee chooses "Continue Duty"
// and records extra punches - a selfie and the location each, like the four - which never become attendance and only count
// for overtime (backend OnDutyOvertimePunch). Pure; tested in onDutyOvertime.test.ts.
import { clock12, durationText } from './onDutyPunches.ts';

export interface ServerOtPunchLike {
  sequence: number;
  punchTime: string;
  status: 'pending' | 'approved' | 'rejected' | string;
}

export interface QueuedOtPunchLike {
  capturedAt: number;
  failed?: boolean;
  error?: string | null;
}

export interface OtRow {
  key: string;
  /** 1, 2, 3 ... in the order they were taken. */
  number: number;
  time: string | null;
  state: 'pending' | 'approved' | 'saved' | 'failed';
  label: string;
  note: string | null;
}

function clockOfMs(ms: number): string {
  const d = new Date(ms);
  return clock12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`) ?? '';
}

/** The OT punches to list: the server's (not rejected), then the ones still on the phone, numbered in order. */
export function otRows(server: readonly ServerOtPunchLike[] | null | undefined, queued: readonly QueuedOtPunchLike[] | null | undefined): OtRow[] {
  const rows: OtRow[] = [];
  const kept = [...(server ?? [])].filter((p) => p.status !== 'rejected').sort((a, b) => a.sequence - b.sequence);
  for (const p of kept) {
    rows.push({
      key: `s${p.sequence}`,
      number: rows.length + 1,
      time: clock12(p.punchTime),
      state: p.status === 'approved' ? 'approved' : 'pending',
      label: p.status === 'approved' ? 'Approved' : 'Waiting for approval',
      note: null,
    });
  }
  for (const q of [...(queued ?? [])].sort((a, b) => a.capturedAt - b.capturedAt)) {
    rows.push({
      key: `q${q.capturedAt}`,
      number: rows.length + 1,
      time: clockOfMs(q.capturedAt),
      state: q.failed ? 'failed' : 'saved',
      label: q.failed ? 'Could not be sent' : 'Saved on phone · sends when online',
      note: q.failed ? q.error ?? null : null,
    });
  }
  return rows;
}

/** "1 h 20 min past your Night Punch time" / null when none. */
export function otSummary(otMinutes: number | null | undefined): string | null {
  if (!otMinutes || otMinutes <= 0) return null;
  return `${durationText(otMinutes * 60_000)} past your Night Punch time`;
}

/**
 * What to show once the four punches are in (session still open): the choice (Complete / Continue Duty) until the
 * employee chose to continue - or already has OT punches - then the OT section.
 */
export function overtimeStage(input: { allFourIn: boolean; open: boolean; continued: boolean; otCount: number }): 'none' | 'choose' | 'overtime' {
  if (!input.open || !input.allFourIn) return 'none';
  return input.continued || input.otCount > 0 ? 'overtime' : 'choose';
}
