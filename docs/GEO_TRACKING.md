# On-Duty geo-tracking (mobile app)

The employee app records the route of an On-Duty session in the background and uploads it to the HRMS (Django). It uses
Expo only: `expo-location` + `expo-task-manager` + `expo-sqlite`, plus `expo-network`, `expo-battery`, `expo-device`,
`expo-intent-launcher`. No paid SDK. Android first; iOS is not covered.

This is the **mobile** half. The server side (tables, journey rebuild, HR portal "Journey History") is in the backend repo;
the contract between them is summarised under [Packet format](#packet-format).

> **A new APK build (EAS) is required.** The native permissions (background location, foreground service, notifications,
> boot, battery optimisation) and the native modules (`expo-task-manager`, `expo-sqlite`, `expo-network`, `expo-battery`,
> `expo-device`, `expo-intent-launcher`) change the Android project. An over-the-air / JS-only update is not enough. The app
> is 5.0.0 / versionCode 5; publish the same version in the HR portal (Mobile App Login -> New Version) after building.
>
> The app is on **Expo SDK 58** (see `SDK_58_UPGRADE.md`). Expo Go (SDK 58) opens the app but cannot run the tracking: the Expo
> docs say background location is "not supported in the Expo Go app" and that foreground/background services are "not available
> in Expo Go for Android". Test it with a development build (`npx expo install expo-dev-client`, then
> `eas build --platform android --profile development`).

## Rules (decided by the owner)

- Tracking **starts when the employee submits an On-Duty request**, before any approval.
- It **ends only** when the server says so: the employee marks the activity Done, the 4th On-Duty punch is captured, the day-end
  job closes the session (23:50 IST by default), or the request is rejected. The phone never decides to stop by itself, and a
  failed server read never stops it. Whatever was recorded is kept on the server.
- A **consent** (the notice text from the server) must be accepted once per notice version, before the first track records.
- Nothing is recorded outside an active track, even with "Allow all the time" granted.

## How it works

```
 GPS fix (Android fused provider, foreground service keeps the process alive)
    |
    v
 expo-task-manager task  ------------------ defined at module scope in index.ts -> src/tracking/collector.ts
    |
    v   runtime.ingestLocations()
 collectorCore.processLocations   keep a point only if the person moved >= 10 m (or the 60 s heartbeat), guess activity,
    |                             decide moving <-> still
    +--> queue.enqueuePoints  ----+
    |                             |   SQLite (expo-sqlite): points + events + meta, ONE device-wide seq
 events.createEventDetector   --> queue.enqueueEvent   GPS off/on, network lost/restored, airplane, battery saver, permission
    |                                                  change, low battery, mock location, clock skew, app killed/restarted
    v
 sync.syncNow('tick')   POST /tracking/batch   30 points / 60 s / foreground / network restored / task tick
    |                    rows are deleted only up to the server's ackSeq
    v
 controller.ensure('tick')   GET /tracking/state (throttled to 1/min): start, keep, restart or stop the collector
```

The same pipeline runs from the app (foreground, network listener) and from the headless task. Nothing is shared in memory:
everything that must be shared (the queue, the heartbeat, the last signal states, the sync back-off) lives in the SQLite
`meta` table.

### Modules (`src/tracking/`)

| File | Role | Tested under `npm test` |
| --- | --- | --- |
| `types.ts`, `constants.ts`, `geo.ts`, `normalize.ts` | shared types, tunables, geometry, defensive reading of server answers | yes |
| `queue.ts` (+ `sql.ts`) | the SQLite queue (points, events, meta; contiguous upload windows; ack deletion; CAS meta) | yes, on real SQL via `node:sqlite` |
| `collectorCore.ts` | which fixes are kept, activity guess, moving/still wish, OS request spec, mode-switch guard | yes |
| `events.ts` | signal edge detection, GPS_OFF/GPS_ON pairing, heartbeat -> APP_KILLED / APP_RESTARTED | yes |
| `sync.ts` | batch body, triggers, back-off, ack rules, trackActive:false, CONSENT_REQUIRED, 401, offline | yes |
| `controller.ts` | `decide()` (pure) and the self-heal: start on request submit, stop only when the server says so | yes |
| `onboarding.ts`, `oem.ts`, `format.ts`, `journeyModel.ts`, `journeyHtml.ts`, `deviceId.ts` | set-up state machine, brand guides, wording, journeys, the map page | yes |
| `activity.ts`, `journeyList.ts` | the "On-Duty Journey" screens as pure functions: activity timeline, break summary, tiles, shared colours; list chips, live status, day groups | yes |
| `collector.ts` | **the only file that touches expo-location / expo-task-manager**: `defineTask`, start/stop, mode switch | no (needs a device) |
| `runtime.ts`, `platform/*`, `api.ts`, `actions.ts`, `useTracking.ts`, `permissions.ts` | wiring to the phone, axios, React hooks | no |

`*.web.ts(x)` variants of `collector`, `platform/sqlite`, `platform/probe`, `platform/intents` and `JourneyMap` keep the native
modules out of the browser bundle.

### Screens

| Route | What |
| --- | --- |
| `/tracking-setup` | consent (notice text from `GET /tracking/state`) then: location, "Allow all the time" (with an explanation first), notifications, battery optimisation (system dialog + brand-specific steps and deep links). Required: consent + foreground location. The rest can be skipped. |
| `/tracking-setup/health` | Tracking health: active track, permission level, location services, battery optimisation, battery saver, internet, notifications, service state, queue size, last point, last upload (+ error), with a fix button per problem |
| `/my-journeys`, `/my-journeys/[id]` | **On-Duty Journey.** List: the journey in progress as a highlighted card (live status, running time, last position), then every earlier one grouped Today / Yesterday / date, each card with date, destination, start - end, status chip (In progress / Completed / Ended by day-end / Rejected / Closed by HR), total time, distance, breaks (+ total), geo-punches n/4; All / 7 / 30 / 90 day filter, pull to refresh, skeleton, empty and error states. Detail: summary tiles (total time, travelling, break time, breaks, distance, no signal), Leaflet + OpenStreetMap map in a WebView (numbered break pins, start/end, route, no-location gaps; plain SVG route if the map cannot load), the **activity timeline** (Journey started -> Break taken -> Journey resumed -> ... -> On-duty completed; rows open for details, "Show on map" and "Open in Google Maps"), the **geo-punch records** (number, time, status, place, accuracy, the photos), device line |
| On-Duty page | one seven-step process (Request -> Approval & route tracking -> Geo-punch 1..4 -> Done), see below |

Entries also in the side drawer ("On-Duty Journey", "Tracking Health") and a Home quick-action tile ("On-Duty Journey", right after "On-Duty").

#### Journey colours (shared with the HR portal, `src/tracking/activity.ts` `TONE_COLOR`)

Journey start and end **#16a34a** (green, one colour for both); a break **#d97706** (amber, under 15 min) or **#7c3aed** (purple, 15 min or
more); travelling / resumed **#006496** (blue); no location **#6b7280** (grey, dashed on the map); a fake / simulated location **#dc2626**
(red). A break is one of the server's `stop` segments; "Journey resumed" is the moment travel starts again after a break. Breaks
within 15 m of each other share one pin ("1 · 3") on the map.

#### The On-Duty page as a process (`src/lib/onDutyFlow.ts`, `src/components/onduty/`)

`buildFlow()` reads the session, the four punch slots and the form state into seven steps, each `done`, `current`, `upcoming`,
`problem` (a rejected request / punch) or `skipped`. The page shows them as a vertical stepper under a hero ("Step 3 of 7" and a
seven-segment bar): finished steps are compact (check, time, place, the punch's Approved / Pending / Rejected chip), the current step is a
highlighted card with the one primary action (the request form; the waiting note on an older backend; "Record Punch N"), the rest are
muted. Punches can still be recorded in **any order**: the current step is the lowest open slot and every other open slot offers
"Record now". A live strip under the hero shows the journey (moving / still / offline / location off, last position, running time,
breaks, distance) and opens the journey.

Recording a punch (`PunchCapture`): "Photo 1 of 2" / "Photo 2 of 2" thumbnails (one tile when `requiredPhotos` is 1), retake per tile,
the location pill (accuracy, tap to retry), and one "Confirm Punch N" button that stays disabled, with the reason written under it,
until every photo is taken and the location is known. The server stays in charge of the count: `requiredPhotos`, `punchPhotos`,
the PHOTO2_REQUIRED answer and `src/lib/onDutyPhotos.ts` are unchanged in behaviour.

## Packet format

`POST /api/tracking/batch` (employee token). The code builds this camelCase body; the app's axios client decamelizes JSON
bodies on the way out (`deviceId` -> `device_id`, `recordedAt` -> `recorded_at`, at every depth), and the server accepts both
spellings. `src/tracking/sync.test.ts` asserts both forms.

```json
{
  "deviceId": "d-lx3k9a2b-3f9c1d7e5a0b4c2d9e8f",
  "app": { "version": "5.0.0", "os": "android", "osVersion": "14", "model": "Redmi Note 12" },
  "health": {
    "permission": "always", "locationEnabled": true, "backgroundRestricted": null, "batteryOptimised": false,
    "powerSave": false, "batteryPct": 71, "charging": false, "network": "cell"
  },
  "points": [
    { "seq": 1800000041, "recordedAt": "2026-10-28T04:31:10.000Z", "latitude": 11.0168, "longitude": 76.9558,
      "accuracy": 6.5, "speed": 1.4, "bearing": 180, "altitude": 412.5, "activity": "walking", "battery": 71,
      "charging": false, "network": "cell", "provider": "fused", "isMocked": false }
  ],
  "events": [
    { "seq": 1800000042, "kind": "GPS_OFF", "startedAt": "2026-10-28T04:35:00.000Z", "latitude": 11.02, "longitude": 76.96 },
    { "seq": 1800000043, "kind": "GPS_ON", "startedAt": "2026-10-28T04:38:20.000Z" }
  ]
}
```

- Limits per call: 500 points + 100 events. The window is **contiguous in `seq`** (points and events share one counter), so
  deleting `seq <= ackSeq` can never delete an unsent row. A 413 halves the window.
- Answer: `{ok, ackSeq, accepted, duplicates, rejected, trackActive, endReason, serverTime, config}`. Rows are deleted up to
  `min(ackSeq, last seq sent)`. If every row of the window was classified (`accepted + duplicates + rejected >= sent`) the whole
  window is done even when `ackSeq` is lower (refused rows never become acceptable). When the server answers
  `trackActive:false` with nothing accepted (no track, or past the 5 minute late-upload window) the rows are released instead of
  being re-sent on every trigger. `trackActive:false` makes the controller flush the rest and stop the collector.
- `403 {code: "CONSENT_REQUIRED"}`: everything stays queued; ticks stop asking until the notice is accepted or the app is
  re-opened. `401`: everything stays queued, nothing is sent under another employee's token (the queue is tied to the employee
  that recorded it; if somebody else signs in on the phone the previous employee's queue is dropped). Offline / 5xx / timeout:
  exponential back-off 5 s, 10 s, 20 s ... capped at 10 min, +-20 %; app foreground and network restore bypass the back-off.
- `seq` is the device-wide `AUTOINCREMENT` of `seq_log`, **seeded with the epoch seconds when the database file is created**, so a
  wiped database (the `deviceId` lives in SecureStore and survives) never counts from 1 again under the same
  `UNIQUE(employee, device, seq)`.
- `GET /api/tracking/state` -> `{enabled, active, consentRequired, noticeVersion, noticeText, serverTime, track, config,
  punchPhotos}`; a 404 means "this server has no tracking" (the old 45 s ping loop then keeps serving On-Duty).
  `POST /api/tracking/consent {deviceId, noticeVersion}`.
- `GET /api/tracking/my-journeys?from=YYYY-MM-DD&to=YYYY-MM-DD&pageSize=200`, `GET /api/tracking/journeys/<id>`. Two additive keys
  feed the On-Duty Journey screens (an older server simply lacks them and the screens hide what depends on them): each list item
  has `punchCount` (how many of the day's four geo-punch slots hold a punch that was not rejected) and the detail has `punches`
  (every geo-punch of the journey's session: number, type, IST date and time, place, accuracy, `hasPhoto` / `hasPhoto2`, status,
  HR comment). The photos are served by `GET /api/on-duty-punch-verifications/<id>/photo?n=1|2` with the bearer token.

### Events

| Kind | Sent when |
| --- | --- |
| `GPS_OFF` / `GPS_ON` | phone location services off / on (polled every tick, and on app foreground) |
| `NETWORK_LOST` / `NETWORK_RESTORED` | connectivity none / back (a `wifi -> cell` switch is not a loss) |
| `AIRPLANE_ON` / `AIRPLANE_OFF`, `POWER_SAVE_ON` / `POWER_SAVE_OFF` | Android airplane mode, battery saver |
| `PERMISSION_CHANGED` `{from, to}` | `always` -> `while_using` -> `denied` and back |
| `LOW_BATTERY` `{pct}` | below 15 % and not charging; re-arms above 20 % |
| `MOCK_LOCATION` | first mocked fix (rising edge); the point itself carries `isMocked` |
| `BACKGROUND_RESTRICTED` | battery optimisation is on for the app |
| `CLOCK_CHANGED` `{skew_seconds}` | the phone clock differs from `serverTime` by more than 2 min |
| `APP_KILLED` (interval) + `APP_RESTARTED` | the engine's heartbeat was silent for longer than max(3 min, 2.5 x the slowest sample interval) before the next start |
| `TRACKING_STARTED` / `TRACKING_STOPPED` | device-side, with the last known place and `meta.origin = "device"` (switch off with `SEND_LIFECYCLE_EVENTS` in `constants.ts`; the server also writes its own) |

Interval events are two events (`GPS_OFF`, later `GPS_ON`); the server closes the open one. Both are queued with their own time,
so an offline stretch reaches the server in order afterwards. Edge state lives in `meta` (`sig.*`) with a compare-and-swap, so
the app's UI and the background task never report the same change twice.

**Not sent:** `DEVICE_SHUTDOWN` (a phone cannot announce its own power-off) and `DEVICE_BOOT`. Expo's uptime clock on Android
does not count deep sleep, so "now minus uptime" lands after the real boot whenever the phone slept and would invent reboots.
The pure `inferInterruption()` already handles a boot time if one is supplied (a native `TrackerEngine` can give
`SystemClock.elapsedRealtime()`); `probe.bootAt()` returns `null` today.

## Android permissions (`app.json`)

| Permission | Why |
| --- | --- |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | location |
| `ACCESS_BACKGROUND_LOCATION` | "Allow all the time": lets the collector be restarted and keep fixes coming from the background |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | the persistent "UKTextiles is recording your on-duty route" notification that keeps the process alive when the app is swiped away |
| `POST_NOTIFICATIONS` | Android 13+: without it the foreground-service notice is hidden (the service still runs) |
| `RECEIVE_BOOT_COMPLETED` | lets expo-task-manager restore its registered task after a reboot |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | the system dialog "Allow UKTextiles to always run in the background?" (falls back to the battery-optimisation list, then App info) |

`expo-location` plugin: `isAndroidBackgroundLocationEnabled`, `isAndroidForegroundServiceEnabled`, notification small icon =
the monochrome launcher icon. The foreground service is **not** killed with the app (`killServiceOnDestroy: false`).

## What each Android brand needs

The set-up's battery step shows the system dialog first, then the steps for the detected brand (`oem.ts`) with a button that
opens the matching settings page (the first intent that exists on the phone; the last fallback is always App info).
The component names are the long-standing ones used by the brands' security apps and differ by model / OS version: **they
could not be verified without each phone**; the written steps are the real instruction.

| Brand (OS) | Needed |
| --- | --- |
| Xiaomi / Redmi / POCO (MIUI, HyperOS) | Autostart ON; Battery saver for the app = No restrictions; lock the app in Recent apps |
| Oppo / Realme / OnePlus (ColorOS, OxygenOS) | Auto-start ON; Battery > the app > allow background activity / don't optimise; lock in Recent apps |
| Vivo / iQOO (Funtouch, OriginOS) | Autostart ON; Background power consumption management > allow high consumption; lock in Recent apps |
| Samsung (One UI) | App battery = Unrestricted; switch off "Put unused apps to sleep"; add to Never sleeping apps |
| Huawei / Honor | App launch > manage manually: allow auto-launch, secondary launch, run in background |
| Others | Battery > Unrestricted / Don't optimise |

## Limitations (read before promising anything to HR)

- **Force-stop** (Settings > App info > Force stop, or a "clean everything" button) kills the service and the task. Nothing
  restarts it until the app is opened. The route then shows a gap; the next start records `APP_KILLED` + `APP_RESTARTED`.
  Swiping the app away from Recent apps is fine; the foreground service survives it.
- **OEM task killers** can still kill the process on some brands even with the steps above. The app self-heals when opened
  (and restarts a service whose heartbeat has gone quiet, on screen, at most every 10 minutes), but cannot prevent it.
- **Android does not allow starting a foreground service from the background.** So a start / restart only happens with the app on
  screen (the controller reports `blockedBy: 'foreground'` otherwise), and the moving <-> still switch of the location request
  (which re-registers the task) is attempted only on screen, and not again for 10 minutes after a refusal. Consequences: a phone
  that stays in a pocket keeps the **fast request all day** (more battery); and after a reboot tracking resumes when the app is
  opened.
- **GPS switched off while the app is swiped away** is only noticed when a location arrives again (no JavaScript runs in
  between), so that gap has cause "unknown" on the server unless the app was open. Same for "airplane mode" etc.
- **No reboot / shutdown detection** (see above). **iOS is not covered** (no background-location entitlement, no iOS testing).
- **Expo Go cannot run it** (SDK 58 docs: background location is "not supported in the Expo Go app"; foreground and background services are "not available in Expo Go for Android"). Background location and the foreground service need a development or EAS build.
- The queue keeps at most 20 000 points (about 17 hours of continuous movement at one point every 3 s, far longer when the person is mostly still); beyond that the oldest points are dropped and
  counted (shown on the health screen). Events are kept.
- The activity guess is from GPS speed only: still / walking / vehicle (`running` and `bicycle` cannot be told from a slow
  vehicle and are never sent).
- The distance filter (`distanceFilterM`) is applied in software, not by the OS: Android's fused provider goes completely silent
  below the OS distance filter, and a silent phone would look offline to the server.
- Stationary detection on the server needs the heartbeat points: while still, one point per `sampleStillSeconds` (60 s) is
  kept, activity `still`.
- Map tiles and the Leaflet script come from openstreetmap.org / unpkg.com (version pinned, no integrity hash); the page falls
  back to a plain route drawing if they cannot load.

## How a future native module plugs in (`TrackerEngine`)

The sync, controller, hooks and screens never import expo-location or expo-task-manager; they use
`src/tracking/types.ts -> TrackerEngine`:

```ts
interface TrackerEngine {
  start(track: ActiveTrack): Promise<EngineStartResult>;   // begin recording for this track (idempotent)
  stop(reason?: string): Promise<void>;
  status(): Promise<EngineStatus>;                          // running, track id, mode, heartbeat ...
  enqueue(event: NewEvent): Promise<number>;                // put an event in the upload queue
}
```

To replace the Expo collector: implement it (a Kotlin foreground service + `FusedLocationProviderClient` + BroadcastReceivers for
`PROVIDERS_CHANGED`, connectivity, power-save, boot), have it write rows through the same SQLite file and `seq` rule
(`queue.ts`; or call `getRuntime().queue`), feed `runtime.ingestLocations()` / `detector.observe()` or reimplement them
natively, call `registerEngine(engine)` (`engineRegistry.ts`) at app start instead of importing `collector.ts`, and optionally
`registerModeSwitcher()`. Supply a real `bootAt` in `platform/probe.ts` to get `DEVICE_BOOT`. Nothing in `sync.ts`,
`controller.ts`, `onboarding.ts` or the screens changes.

## Tests

`npm test` (Node's built-in runner, TypeScript type-stripping): 155 tests added for this feature, 415 in total (the On-Duty step machine, the activity timeline and the journey list are among them).
`src/tracking/testing/nodeSqlite.ts` runs the queue's real SQL over `node:sqlite`, including "the process died and the file was
re-opened". Covered: queue (sequence, contiguous windows, ack, crash recovery, overflow, CAS), collector decisions, events and the
heartbeat inference, sync (body shape + axios decamelize, batching, back-off, ack rules, trackActive:false, consent, 401, offline,
lost response, 413, single flight), controller self-heal decisions, set-up state machine and issues, brand guides, journey model
and map page, server shape normalisation, the two-photo punch flow.

**Not proven by any test (needs a device build):** the background task actually receiving fixes with the app swiped away, the
foreground service and its notification, real GPS, permission dialogs, the battery-optimisation dialog and each brand's deep
link, WebView + map rendering on a phone, behaviour after reboot, and battery cost.
