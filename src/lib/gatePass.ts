// What a gate pass card says (pure; tested in gatePass.test.ts). One reading for the Gate Outpass page and the On-Duty
// page (owner 2026-11-24: "a standard, static, professional Gatepass card", the same card in both places).
//
// The server decides everything that matters (backend outpass_request_views._outpass_request_json): `qrToken` is there only
// while the pass may be shown at the gate, `returnQrToken` only while the way back in is open. A pass is shown as soon as it
// is asked for (an On-Duty's pass the moment the On-Duty is submitted) but its QR ONLY after HR / the HOD approved it
// (owner 2026-11-24): a pending pass never shows a QR, even if an older server sent one.

export interface GatePassLike {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  source?: 'manual' | 'on_duty' | string | null;
  qrToken?: string | null;
  returnQrToken?: string | null;
  exitedAt?: string | null;
  enteredAt?: string | null;
  expiresAt?: string | null;
  scanStatus?: string | null;
  onDutyStatus?: string | null;
}

export type GatePassState =
  | 'valid'
  | 'waiting'
  | 'out'
  | 'return-ready'
  | 'returned'
  | 'expired'
  | 'rejected';

export type GatePassTone = 'green' | 'amber' | 'blue' | 'red' | 'grey';

export interface GatePassView {
  state: GatePassState;
  /** The status line on the card ("Valid at the gate"). */
  title: string;
  /** One sentence under it. */
  note: string;
  tone: GatePassTone;
  qr: { value: string; caption: string; kind: 'exit' | 'return' } | null;
  /** Pending approval: no QR; the pending design (animation + Refresh). */
  awaitingApproval: boolean;
  /** Can be used / is in use today: the passes the Gate Outpass page pins on top. */
  live: boolean;
}

export function isOnDutyPass(pass: GatePassLike): boolean {
  return pass.source === 'on_duty';
}

export function gatePassView(pass: GatePassLike): GatePassView {
  const onDuty = isOnDutyPass(pass);
  const awaitingApproval = pass.status === 'pending';

  if (pass.status === 'rejected') {
    return {
      state: 'rejected',
      title: onDuty ? 'On-Duty not approved' : 'Not approved',
      note: onDuty ? 'The On-Duty request was rejected, so this pass cannot be used.' : 'This gate pass was not approved.',
      tone: 'red',
      qr: null,
      awaitingApproval: false,
      live: false,
    };
  }
  if (pass.enteredAt) {
    return { state: 'returned', title: 'Back in', note: 'You went out and came back. This pass is complete.', tone: 'grey', qr: null, awaitingApproval: false, live: false };
  }
  if (pass.returnQrToken) {
    return {
      state: 'return-ready',
      title: 'Ready to come back in',
      note: 'Show this QR at the gate when you return.',
      tone: 'blue',
      qr: { value: pass.returnQrToken, caption: 'SHOW THIS QR TO COME BACK IN', kind: 'return' },
      awaitingApproval: false,
      live: true,
    };
  }
  if (pass.exitedAt) {
    return {
      state: 'out',
      title: 'Out of the gate',
      note: 'When you come back, make a return QR and show it at the gate.',
      tone: 'blue',
      qr: null,
      awaitingApproval: false,
      live: true,
    };
  }
  if (awaitingApproval) {
    return {
      state: 'waiting',
      title: 'Pending approval',
      note: onDuty
        ? 'Your On-Duty is waiting for HR / your Department Head. The QR appears here as soon as it is approved.'
        : 'Waiting for HR / your Department Head. The QR appears here as soon as the pass is approved.',
      tone: 'amber',
      qr: null,
      awaitingApproval: true,
      live: true,
    };
  }
  if (pass.qrToken) {
    return {
      state: 'valid',
      title: 'Valid at the gate',
      note: onDuty ? 'Approved with your On-Duty. Show the QR at the gate.' : 'Approved. Show the QR at the gate.',
      tone: 'green',
      qr: { value: pass.qrToken, caption: 'SHOW THIS QR AT THE GATE', kind: 'exit' },
      awaitingApproval: false,
      live: true,
    };
  }
  return {
    state: 'expired',
    title: 'Not valid now',
    note: onDuty
      ? 'The On-Duty has ended, so this pass can no longer be used at the gate.'
      : 'This pass was not used in time. Ask for a new one if you still need to go out.',
    tone: 'grey',
    qr: null,
    awaitingApproval,
    live: false,
  };
}

/** A file name for the downloaded card image: "gate-pass-OUT-123.png". */
export function gatePassFileName(pass: Pick<GatePassLike, 'id'>): string {
  return `gate-pass-OUT-${pass.id}.png`;
}
