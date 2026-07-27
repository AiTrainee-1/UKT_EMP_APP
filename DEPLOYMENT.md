# Mobile App Deployment Guide

How to configure environment variables, build a distributable APK with EAS,
and keep the app's identity (name, icon, package) consistent across every
future deployment.

> Looking to publish on the Google Play Store or Apple App Store instead of
> sharing the APK directly? See [`APP_STORE_PUBLISHING.md`](APP_STORE_PUBLISHING.md).

---

## Table of Contents

- [1. Environment variables](#1-environment-variables)
- [2. First-time EAS setup](#2-first-time-eas-setup)
- [3. Building the APK](#3-building-the-apk)
- [4. Keeping the app name consistent across deployments](#4-keeping-the-app-name-consistent-across-deployments)
- [5. Version bumping between releases](#5-version-bumping-between-releases)
- [6. Distributing the APK](#6-distributing-the-apk)
- [7. Post-build checklist](#7-post-build-checklist)
- [8. Troubleshooting](#8-troubleshooting)

---

## 1. Environment variables

There are **two separate places** env values live, and they are not
interchangeable:

| File | Used by | Ships into the APK? |
|---|---|---|
| `.env` | `npx expo start` (local Metro dev server on your PC) | No |
| `eas.json` → `build.<profile>.env` | `eas build` (cloud build that produces the APK) | Yes — baked in at build time |

A cloud build does **not** read your local `.env` file to decide what
`EXPO_PUBLIC_API_URL` to bundle. If you only edit `.env` and then run
`eas build`, the APK will still call whatever URL is in `eas.json` for that
profile. **Always update both** when the backend URL changes.

### 1.1 Local development — `.env`

This repo already has a `.env` at the project root (gitignored variants are
`.env*.local`; the base `.env` itself is currently tracked in git). A
template is provided at [`.env.example`](.env.example) — copy it if you ever
need to recreate `.env` from scratch:

```powershell
Copy-Item .env.example .env
```

Current variables:

```
EXPO_PUBLIC_API_URL=http://192.168.0.56:8000/api
EXPO_PUBLIC_APP_NAME=UKTextiles
```

- **`EXPO_PUBLIC_API_URL`** — the Django REST API base URL. Must be
  reachable from the phone: same WiFi as the Django server for local dev,
  or a public HTTPS URL for anything shared outside your LAN. Any env var
  consumed by Expo/React Native client code **must** be prefixed
  `EXPO_PUBLIC_` — anything without that prefix is silently unavailable at
  runtime.
- **`EXPO_PUBLIC_APP_NAME`** — present in `.env` and documented in
  `README.md`, but **not currently read anywhere in the app's source
  code**. It does nothing today. The app's actual on-device display name
  is controlled by `app.json` → `expo.name` (see [§4](#4-keeping-the-app-name-consistent-across-deployments)),
  not this variable. Kept here in case a future screen wants to render the
  brand name dynamically; harmless to leave as-is.

Any change to `.env` requires restarting `npx expo start` (env values are
read once at bundler startup, not hot-reloaded).

### 1.2 Cloud builds — `eas.json`

```json
{
  "build": {
    "preview": {
      "env": { "EXPO_PUBLIC_API_URL": "http://192.168.0.56:8000/api" }
    },
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://hrms.uktextiles.in/api" }
    }
  }
}
```

- `preview` profile → points at the local/LAN dev server, for internal
  testing builds.
- `production` profile → points at the real deployed backend. **This is
  the URL every employee's installed APK will actually use.**

To change which backend a production build talks to, edit the
`production.env.EXPO_PUBLIC_API_URL` value in `eas.json` — not `.env` — then
rebuild.

If a value is ever sensitive enough that it shouldn't sit in a committed
`eas.json` (API keys, secrets), use an EAS-managed secret instead of a
plain `env` entry:

```powershell
eas secret:create --scope project --name SOME_SECRET_NAME --value "actual-value"
```

Secrets created this way are referenced automatically by name during the
build and never appear in the repo. Not needed today since the current
variables (API URL, app name) aren't secrets — just noting it for later.

---

## 2. First-time EAS setup

Only needs to be done once per machine/account.

```powershell
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account (create one at expo.dev if needed)
eas login

# Link this project to your Expo account
eas init
```

If `app.json` has no `expo.extra.eas.projectId` set (the current state of
this repo), `eas init` **creates a brand-new EAS project** under whichever
account you're logged in as, and writes the new `projectId` (and `owner`)
back into `app.json` for you. If a `projectId` is already present, `eas
init` instead re-links to that existing project — which only works if your
logged-in account actually has access to it.

> **"Entity not authorized" / "You don't have the required permissions"**
> during `eas build` means `app.json` still points at a project (via
> `projectId`/`owner`) that belongs to an account or org you're not a
> member of. Fix: delete the `expo.extra.eas.projectId` and `expo.owner`
> fields from `app.json`, then run `eas init` again while logged in as the
> a ccount that should own this app going forward — it'll create a fresh
> project and re-populate those fields correctly.

---

## 3. Building the APK

```powershell
eas build --platform android --profile production
```

- Runs on Expo's cloud servers, not your machine (~10–15 minutes).
- Progress and the final `.apk` download link are shown in the terminal,
  and also appear at [expo.dev](https://expo.dev) under this project's
  Builds tab.
- Use `--profile preview` instead for an internal test build pointed at
  the LAN/dev backend rather than production.

| Profile | Output | Backend it calls | Use for |
|---|---|---|---|
| `development` | APK (dev client) | LAN dev server | Attaching a debugger |
| `preview` | APK | LAN dev server | Internal testing before a real release |
| `production` | APK | `https://hrms.uktextiles.in/api` | Distributing to employees |

---

## 4. Keeping the app name consistent across deployments

The name shown under the app icon on an employee's phone, and the name
shown during install, comes from **`app.json` → `expo.name`** — not from
any env var, and not from `package.json`. Every EAS build reads this field
at build time and bakes it into the APK's native app label.

```json
{
  "expo": {
    "name": "uktextiles",
    "slug": "ukt-team",
    "ios": { "bundleIdentifier": "net.uktex.employee" },
    "android": { "package": "net.uktex.employee" },
    "owner": "<expo-account-or-org-that-owns-this-project>"
  }
}
```

`owner` and `extra.eas.projectId` are populated automatically by `eas init`
(see [§2](#2-first-time-eas-setup)) — don't hand-edit them unless you're
deliberately detaching from one EAS account/project to create a new one.

These four fields matter differently — know which ones are safe to change
and which ones are permanent:

| Field | Safe to change any time? | What happens if you change it |
|---|---|---|
| `expo.name` | ✅ Yes | Next build shows the new label under the icon. Existing installs keep their old label until the employee installs the new build over it. |
| `expo.icon` / `android.adaptiveIcon.*` / `expo.splash.image` | ✅ Yes | Next build ships the new artwork. Swap the PNGs in `assets/` and point these paths at them. |
| `expo.slug` | ⚠️ No, not after `eas init` | This is part of how EAS Build finds this project. Changing it effectively detaches the repo from the existing Expo project — you'd need `eas init` again, and old builds/history stay behind under the old slug. |
| `android.package` / `ios.bundleIdentifier` | 🛑 Never, once real installs exist | This is the app's permanent unique identity on the device and (if ever published) in the Play Store / App Store. Changing it means every future build is treated as a **completely different app** — existing installs won't upgrade in place; employees would have to uninstall the old one and install the new one as a fresh app, losing any local-only state (nothing server-side is lost, since auth/data live in Django, but push-token registration etc. would need to happen again). |

### Recipe: renaming the app for a future deployment

1. Edit `app.json` → `expo.name` to the new display name.
2. If also rebranding visually, replace `assets/icon.png`,
   `assets/android-icon-foreground.png` /`-background.png` /`-monochrome.png`,
   and `assets/splash-icon.png` with the new artwork (keep the same
   filenames so no other config needs to change — or update the paths in
   `app.json` if you use new filenames).
3. Leave `expo.slug`, `android.package`, `ios.bundleIdentifier`, and
   `expo.extra.eas.projectId` untouched.
4. Bump `expo.version` (see [§5](#5-version-bumping-between-releases)).
5. Run `eas build --platform android --profile production` as normal.
6. Distribute the new APK — employees install it over the existing app
   (same package name → clean in-place upgrade, same login/session
   behavior as before).

This is the only reliable way to keep "the app name maintained" release
after release: it lives in one field (`app.json` → `expo.name`), every
build reads it fresh, and as long as `android.package` /
`ios.bundleIdentifier` never change, each new APK upgrades the same
installed app instead of becoming a stranger app on the employee's phone.

---

## 5. Version bumping between releases

`app.json` → `expo.version` (currently `"1.0.0"`) is a human-readable
version string shown to you, not enforced by Android for a sideloaded APK.
Bump it before each production build so builds are distinguishable:

```json
"version": "1.1.0"
```

There is currently no explicit `android.versionCode` in `app.json` — Expo
auto-assigns one per build when it's omitted. If two builds are ever
installed side-by-side for comparison, or if this app is later published
to the Play Store (which enforces a strictly increasing `versionCode`),
add an explicit counter:

```json
"android": {
  "package": "net.uktex.employee",
  "versionCode": 2
}
```

...and increment it by hand on every production build. Not required for
today's "share an APK file directly" distribution model, but worth adding
if this ever moves to the Play Store.

---

## 6. Distributing the APK

1. Download the `.apk` from the EAS build link or expo.dev.
2. Transfer it to the employee's phone (USB cable, WhatsApp, Google Drive,
   or an internal file share).
3. On the phone: **Settings → Install unknown apps → allow the app you
   used to open the file (e.g. Files, WhatsApp) → Install**.
4. If the employee already has an older build of this app installed with
   the same `android.package`, installing the new APK upgrades it in
   place — no need to uninstall first, and no data loss (all real data is
   server-side).

---

## 7. Post-build checklist

Before handing a production APK to employees, confirm:

- [ ] `eas.json` → `build.production.env.EXPO_PUBLIC_API_URL` points at the
      correct live backend (not the LAN/dev URL).
- [ ] `app.json` → `expo.name` shows the name you actually want employees
      to see under the icon.
- [ ] `app.json` → `expo.version` was bumped from the last release.
- [ ] `android.package` / `ios.bundleIdentifier` are unchanged from the
      previous release (unless intentionally launching this as a brand
      new, separate app).
- [ ] Install the built APK once yourself and check: app name under the
      icon, splash screen, and that login actually reaches the live API
      (not a stale cached bundle from a previous build).

---

## 8. Troubleshooting

- **App shows the old name after installing a new build** — the phone is
  likely still running a previously installed APK; fully close and
  reopen the app, or uninstall/reinstall if unsure which build is active.
- **New build still calls the old backend URL** — you edited `.env` but
  not `eas.json`. Cloud builds only read the `env` block in `eas.json`
  per profile (see [§1.2](#12-cloud-builds--easjson)).
- **Login works locally (`expo start`) but fails in the built APK** — same
  cause as above: the `preview`/`production` profile in `eas.json` still
  has the old/local `EXPO_PUBLIC_API_URL`.
- **`expo doctor` warns about `usesCleartextTraffic`** — false-positive
  schema warning; the field is required and works correctly for HTTP
  (non-HTTPS) connections to a local dev server, per `README.md`.
