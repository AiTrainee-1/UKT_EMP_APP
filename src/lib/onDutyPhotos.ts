// The On-Duty punch photos as pure functions. HR switches the punch between ONE photo and TWO (Settings -> Geo-tracking
// rules); the server says which in `requiredPhotos` (GET /on-duty-sessions/status) and `punchPhotos` (GET /tracking/state).
// With two, the app takes "Photo 1 of 2" and "Photo 2 of 2", each can be retaken, both are previewed, and the multipart
// body carries `photo` and `photo2`. A server that wants two and receives one answers 400 PHOTO2_REQUIRED.

export type PhotoCount = 1 | 2;

export interface PhotoPlan {
  required: PhotoCount;
  /** One slot per required photo: the local file URI, or null while it has not been taken. */
  uris: (string | null)[];
}

/** 1 or 2: the status endpoint's value, else the tracking state's, else 1. Only a literal 2 means two. */
export function requiredPhotoCount(...sources: unknown[]): PhotoCount {
  for (const s of sources) {
    if (s === 2 || s === '2') return 2;
    if (s === 1 || s === '1') return 1;
  }
  return 1;
}

export function newPhotoPlan(required: PhotoCount): PhotoPlan {
  return { required, uris: Array.from({ length: required }, () => null) };
}

/** The same plan with this slot taken (or retaken); a slot beyond the required count is ignored. */
export function withPhoto(plan: PhotoPlan, index: number, uri: string): PhotoPlan {
  if (index < 0 || index >= plan.required) return plan;
  const uris = plan.uris.slice();
  uris[index] = uri;
  return { ...plan, uris };
}

/** The plan after the server's requirement changed mid-capture: kept photos stay, slots are added or dropped. */
export function withRequired(plan: PhotoPlan, required: PhotoCount): PhotoPlan {
  if (plan.required === required) return plan;
  const uris = Array.from({ length: required }, (_, i) => plan.uris[i] ?? null);
  return { required, uris };
}

/** Index of the first photo still to take, or null when the plan is complete. */
export function nextMissingPhoto(plan: PhotoPlan): number | null {
  const i = plan.uris.findIndex((u) => !u);
  return i === -1 ? null : i;
}

export function isPhotoPlanComplete(plan: PhotoPlan): boolean {
  return nextMissingPhoto(plan) == null;
}

/** "Photo" when one is needed; "Photo 1 of 2" / "Photo 2 of 2" when two are. */
export function photoLabel(index: number, required: PhotoCount): string {
  return required === 2 ? `Photo ${index + 1} of 2` : 'Photo';
}

/** The camera button's wording for the next missing photo. */
export function captureButtonLabel(plan: PhotoPlan): string {
  const i = nextMissingPhoto(plan);
  if (i == null) return 'Retake';
  return plan.required === 2 ? `Take ${photoLabel(i, 2)}` : 'Take photo';
}

export interface PhotoSlotView {
  index: number;
  /** "Photo 1 of 2" / "Photo 2 of 2", or "Photo" for a one-photo punch. */
  label: string;
  uri: string | null;
  /** The slot to fill next (the first empty one). */
  isNext: boolean;
}

/** One view per slot, for the "Photo 1 of 2" / "Photo 2 of 2" tiles. A one-photo punch is the same component with one tile. */
export function photoSlotViews(plan: PhotoPlan): PhotoSlotView[] {
  const next = nextMissingPhoto(plan);
  return plan.uris.map((uri, index) => ({ index, label: photoLabel(index, plan.required), uri, isNext: index === next }));
}

/** "0 of 2 photos taken" / "1 of 2 photos taken" / "2 of 2 photos taken"; "Photo taken" / "No photo yet" for a one-photo punch. */
export function photoProgressText(plan: PhotoPlan): string {
  const taken = plan.uris.filter(Boolean).length;
  if (plan.required === 1) return taken ? 'Photo taken' : 'No photo yet';
  return `${taken} of ${plan.required} photos taken`;
}

/**
 * Why the confirm button is still disabled, in words ("Take Photo 2 of 2 to continue"), or null when the punch can be sent:
 * every required photo is taken AND the location is known.
 */
export function confirmBlocker(plan: PhotoPlan, hasLocation: boolean): string | null {
  const i = nextMissingPhoto(plan);
  if (i != null) return plan.required === 2 ? `Take ${photoLabel(i, 2)} to continue` : 'Take the photo to continue';
  if (!hasLocation) return 'Waiting for your location';
  return null;
}

export interface PunchFormInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  isMocked?: boolean;
  punchNumber?: number;
  /** Local URIs, first then second (a second one only when two were taken). */
  photoUris: string[];
}

export interface FormEntry {
  name: string;
  /** A text field, or a file part in React Native's {uri, name, type} form. */
  value: string | { uri: string; name: string; type: string };
}

/**
 * The multipart fields of POST /on-duty-sessions/punch, in order. Note the keys are NOT converted to snake_case: the app's
 * axios client leaves FormData untouched (src/lib/api.ts), and the server reads these exact names.
 */
export function punchFormEntries(input: PunchFormInput): FormEntry[] {
  const out: FormEntry[] = [
    { name: 'latitude', value: String(input.latitude) },
    { name: 'longitude', value: String(input.longitude) },
  ];
  if (input.accuracy != null) out.push({ name: 'accuracy', value: String(input.accuracy) });
  if (input.punchNumber != null) out.push({ name: 'punchNumber', value: String(input.punchNumber) });
  out.push({ name: 'isMocked', value: String(!!input.isMocked) });
  if (input.photoUris[0]) out.push({ name: 'photo', value: { uri: input.photoUris[0], name: 'punch.jpg', type: 'image/jpeg' } });
  if (input.photoUris[1]) out.push({ name: 'photo2', value: { uri: input.photoUris[1], name: 'punch2.jpg', type: 'image/jpeg' } });
  return out;
}

export interface PunchError {
  code: string | null;
  message: string;
  /** The server wants a second photo that was not sent. */
  needsSecondPhoto: boolean;
}

/** What to tell the employee about a failed punch. PHOTO2_REQUIRED gets a plain-language message, not the raw server text. */
export function describePunchError(err: unknown): PunchError {
  const e = (err ?? {}) as { response?: { data?: { code?: unknown; error?: unknown } }; message?: unknown };
  const data = e.response?.data;
  const code = typeof data?.code === 'string' ? data.code : null;
  if (code === 'PHOTO2_REQUIRED') {
    return {
      code,
      needsSecondPhoto: true,
      message: 'This punch needs two photos now. Take the second photo and submit again. If it still fails, please update the UKTextiles app.',
    };
  }
  const server = typeof data?.error === 'string' && data.error ? data.error : null;
  const local = typeof e.message === 'string' && e.message ? e.message : null;
  return { code, needsSecondPhoto: false, message: server ?? local ?? 'Failed to submit punch' };
}
