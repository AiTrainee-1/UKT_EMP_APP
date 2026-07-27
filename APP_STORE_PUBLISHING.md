# Publishing the UKTextiles App to Google Play & Apple App Store

A complete, beginner-friendly walkthrough for taking this app from "APK I install manually" to "officially listed on both stores" — written assuming you have never done this before.

This is a companion to [`DEPLOYMENT.md`](DEPLOYMENT.md) (which covers building the APK with EAS). This document covers everything *after* the build: accounts, store listings, review, and ongoing releases.

---

## Table of Contents

1. [Read This First — Public Store or Private Company Distribution?](#1-read-this-first--public-store-or-private-company-distribution)
2. [Prerequisites Checklist](#2-prerequisites-checklist)
3. [Developer Accounts](#3-developer-accounts)
4. [Required Assets, Metadata & Legal Documents](#4-required-assets-metadata--legal-documents)
5. [Preparing *This* App for Store Submission](#5-preparing-this-app-for-store-submission)
6. [Step-by-Step: Google Play Store](#6-step-by-step-google-play-store)
7. [Step-by-Step: Apple App Store](#7-step-by-step-apple-app-store)
8. [Review & Verification Process](#8-review--verification-process)
9. [Cost Breakdown](#9-cost-breakdown)
10. [Best Practices Before Launch](#10-best-practices-before-launch)
11. [Common Mistakes to Avoid](#11-common-mistakes-to-avoid)
12. [Additional Recommendations](#12-additional-recommendations)
13. [Command Cheat Sheet](#13-command-cheat-sheet)

---

## 1. Read This First — Public Store or Private Company Distribution?

Before spending money or time, make one decision: **do employees need to find this app by searching the Play Store / App Store, or is it fine if it's only ever installed by people at UKTextiles?**

This app is an internal HR/attendance tool — it requires an Employee Code to log in, it's useless to anyone outside the company, and it asks for **location** and **camera** permissions to verify attendance punches. That combination matters:

| | Public Store Listing | Private/Enterprise Distribution |
|---|---|---|
| Who can find/install it | Anyone searching the store (unless you set it to "unlisted") | Only people you explicitly authorize |
| Review strictness | Full review, including extra scrutiny for location-permission apps | Little to no review (Apple in-house) or lightweight (Google Managed Play) |
| Best for | Consumer apps, or a company that's fine with the app being publicly discoverable | Internal tools like this one |
| Google's mechanism | Full production listing | **Managed Google Play** (private app on your Google Workspace domain) or a permanent **Closed Testing track** with a fixed tester list |
| Apple's mechanism | Full App Store listing | **Apple Business Manager + Custom Apps** (private, still needs the standard $99/yr account) or **Apple Developer Enterprise Program** ($299/yr, no App Store review at all, installed via MDM) |

**Apple explicitly discourages public listing for apps like this one.** Their App Store Review Guidelines (§4.2.6 and the general intro) state that apps of limited use to the general public, or that exist mainly to serve one organization's internal needs, don't belong on the public App Store even if you gate the content behind a login — and reviewers do reject apps on this basis. Google is more permissive but still recommends Managed Google Play for internal business apps.

**Recommendation:** Use **Managed Google Play** (Android) and **Apple Business Manager + Custom Apps** (iOS). Both still require you to fill out almost everything in this guide (developer account, privacy policy, screenshots, etc.) — the difference is *who can see and install the app*, not how much preparation you need to do. If you later decide UKTextiles wants this to be a public product, nothing here is wasted; you'd just flip the visibility setting.

The rest of this document covers the **full public-store process**, since it's a superset of the private process — anywhere something is different for private distribution, it's called out in a callout box like this:

> 🔒 **Private distribution note:** ...

If you're not sure which path to take, it's fine to start the account setup below and decide at the final "submit for review" step — nothing before that step commits you either way.

---

## 2. Prerequisites Checklist

Gather these before you start — having them ready up front avoids the most common cause of delay (submitting, then waiting on missing paperwork).

- [ ] **A company email address** you control long-term (not a personal Gmail) — e.g. `apps@uktextiles.in`. Both stores tie the account to this email permanently.
- [ ] **A payment method** for the one-time/annual developer fees (credit or debit card that supports international payments — Play Console and Apple Developer both charge in USD).
- [ ] **Company legal details**: registered business name, address, and (for Apple's organization accounts) a **D-U-N-S Number** — see [§3.2](#32-apple-developer-program).
- [ ] **A phone number** for account verification (SMS/call).
- [ ] **App icon** at 1024×1024px, no transparency, no rounded corners (both stores add their own corner-rounding).
- [ ] **At least 2–8 screenshots** per platform, taken from a real device or emulator (see [§4.2](#42-screenshots)).
- [ ] **A short and long description** of the app in plain English.
- [ ] **A Privacy Policy** hosted at a public URL (mandatory — see [§4.4](#44-privacy-policy-mandatory-for-both-stores)).
- [ ] **A support contact** — an email address or web page employees/reviewers can reach if something goes wrong.
- [ ] Decide: public listing or private/enterprise distribution (§1).

---

## 3. Developer Accounts

### 3.1 Google Play Console

1. Go to [play.google.com/console/signup](https://play.google.com/console/signup).
2. Sign in with (or create) a Google account you'll use for the company long-term.
3. Choose **Organization** account type (not "Individual") — since this is a company app, this lets you add teammates later with proper role-based access, and is required if you want Managed Google Play.
4. Pay the **one-time $25 USD registration fee**.
5. Fill in organization details: legal name, address, and a D-U-N-S Number *may* be requested for organization verification (Google will tell you if it's needed for your account — not always required, unlike Apple).
6. **Identity verification**: Google will ask for a government-issued ID and/or business registration documents, and may call the phone number on file. This step alone can take a few days to a couple of weeks — start it as early as possible, well before you're ready to submit the app itself.
7. Once verified, you land in the **Play Console dashboard** — this is where you'll create the app listing (§6).

> 🔒 **Private distribution note:** To use Managed Google Play (install only for your organization's Google Workspace users), you additionally need a **Google Workspace** account for UKTextiles and to enable Managed Google Play from the Play Console under **Setup → API access** / **Managed Play** settings. If UKTextiles doesn't already use Google Workspace for company email, this is an extra step — talk to whoever manages the company's IT/email before committing to this path.

### 3.2 Apple Developer Program

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/).
2. Sign in with (or create) an **Apple ID** for the company.
3. Choose enrollment as an **Organization** (not "Individual") — required if you want the app to be published under "UKTextiles" rather than a person's name, and required for Apple Business Manager / Custom Apps.
4. For an Organization account you need:
   - Legal entity name and it must match public records exactly.
   - A **D-U-N-S Number** — a free business identifier issued by Dun & Bradstreet. If UKTextiles doesn't already have one, request it at [developer.apple.com/enroll/duns-lookup](https://developer.apple.com/enroll/duns-lookup/) — this alone can take **1–2 weeks**, sometimes longer in India, so start this before anything else in this whole document.
   - Legal authority to bind the organization (you'll need to confirm you're authorized to sign on the company's behalf, or provide someone who is).
5. Pay the **$99 USD/year** fee.
6. Apple verifies the organization (similar identity/legal checks to Google) — budget **1–2 weeks**.
7. Once approved, you get access to **App Store Connect** — this is where you'll create the app listing (§7).

> 🔒 **Private distribution note:** For fully private in-house distribution with **no App Store review at all**, enroll instead in the **Apple Developer Enterprise Program** ($299/year, separate from the $99 program, requires additional vetting and a real registered business with a D-U-N-S number). Apps are installed via Mobile Device Management (MDM) or a direct link, never appear in any App Store, and there's no review step — but you're fully responsible for security/compliance since Apple isn't checking it. For most companies, the standard $99 account + **Apple Business Manager + Custom Apps** (private but still reviewed once, lightly) is the better tradeoff of cost vs. control. Set up Business Manager at [business.apple.com](https://business.apple.com/).

---

## 4. Required Assets, Metadata & Legal Documents

### 4.1 Icons & Graphics

| Asset | Size | Used by | Notes |
|---|---|---|---|
| App icon | 1024×1024px PNG, no transparency | Both stores | Square, no rounded corners — each store rounds it themselves |
| Android adaptive icon (foreground) | 512×512px PNG, transparent background | Play Store | This app already has one at `assets/android-icon-foreground.png` |
| Feature graphic | 1024×500px | Play Store listing banner | Required for a full production listing |
| Apple App Store icon | Reuses the 1024×1024 icon uploaded in App Store Connect | Apple | |

This app's current `app.json` already points at icon/splash files under `assets/` — reuse those for consistency, just make sure the 1024×1024 master version exists (App Store Connect and Play Console both want the icon uploaded separately from what's baked into the binary).

### 4.2 Screenshots

Both stores require screenshots sized to specific device classes. Take these from a real phone (or the Expo Go / built APK running in an emulator) showing real screens — Login, Home, Attendance, and 2–3 more representative screens.

| Platform | Minimum required | Typical sizes needed |
|---|---|---|
| Google Play | 2 screenshots minimum, phone form factor | 16:9 or 9:16, at least 320px on the short side, up to 3840px on the long side |
| Apple App Store | At least one set per supported device size | 6.7" iPhone (1290×2796) is mandatory; others are auto-scaled from it if you don't provide separates |

Tip: take screenshots at the **largest** required size first — both stores can downscale for smaller device classes, but never upscale cleanly.

### 4.3 App Listing Text

Prepare in advance (both stores ask for near-identical fields):

- **App name** — Play Store max 30 characters, Apple max 30 characters. `uktextiles` (as currently set in `app.json`) fits.
- **Short description** — Play Store "short description" (80 chars), Apple "subtitle" (30 chars).
- **Full description** — up to 4000 characters. Plain language: what the app does (attendance punching, leave/permission requests, salary slips, on-duty tracking), who it's for (UKTextiles employees only — say this explicitly, it helps reviewers understand a login-gated internal app).
- **Category** — Business or Productivity.
- **Contact email** (public-facing, shown to users).
- **Support URL** — even a simple page with your support email is enough.
- **Marketing URL** (optional, Apple) — the company website is fine.

### 4.4 Privacy Policy (mandatory for both stores)

You cannot submit to either store without a **live, public URL** to a privacy policy. Since this app collects location and photos, the policy must specifically cover:

- What personal data is collected (Employee Code, name, GPS location during on-duty sessions, punch-verification selfie photos, attendance timestamps, push notification token).
- Why it's collected (attendance verification, payroll, HR approval workflows).
- Who it's shared with (state clearly: **not shared with third parties**, used only internally by UKTextiles HR).
- How long it's retained.
- That location tracking only happens while an employee has an active On-Duty session or HR has explicitly enabled tracking for their account — not continuous background tracking of everyone.
- A contact method for privacy questions/data deletion requests.

This doesn't need to be a long legal document — a clear one-page policy covering the points above, hosted at (for example) `https://uktextiles.in/privacy` or `https://hrms.uktextiles.in/privacy`, is sufficient for both stores. Have this live *before* you start filling in either store listing — you'll be asked for the URL partway through.

### 4.5 Data Safety (Google) / App Privacy "Nutrition Label" (Apple)

Both stores make you fill out a structured questionnaire describing your data practices — this is separate from (but must match) your privacy policy text.

- **Google Play → App content → Data safety**: declares each data type collected (Location, Photos, Personal info) and for each: is it collected, is it shared, is it optional, why (App functionality), is it encrypted in transit, can users request deletion.
- **Apple → App Privacy section in App Store Connect**: same idea — "Data Used to Track You," "Data Linked to You," "Data Not Linked to You," per category (Location, User Content/Photos, Identifiers).

For this app, both forms should reflect: Location (precise, while app is in use for on-duty tracking), Photos (selfie for punch verification), and basic identifiers (Employee Code/name) — all collected for **App Functionality**, not for advertising, not shared with third parties, not used for tracking across other apps/websites.

### 4.6 Content Rating Questionnaires

Both stores ask a short questionnaire about violence, gambling, user-generated content, etc. For an internal HR tool, every answer is "No" and you'll land at the lowest possible rating (Everyone / 4+). Takes under 5 minutes.

---

## 5. Preparing *This* App for Store Submission

A few concrete things need to change in this repo's config before either store will accept a build — none of these are done yet, so treat this as your pre-submission checklist:

### 5.1 Android: build an App Bundle, not an APK

Google Play requires an **Android App Bundle (`.aab`)** for the production track — the `eas.json` `production` profile currently builds a plain `.apk` (used for the manual-install flow in `DEPLOYMENT.md`). You'll want a dedicated profile, e.g.:

```json
"production-store": {
  "android": { "buildType": "app-bundle" },
  "env": { "EXPO_PUBLIC_API_URL": "https://hrms.uktextiles.in/api" }
}
```

Build it with:
```powershell
eas build --platform android --profile production-store
```

Keep the existing `production` (APK) profile too — it's still useful for quickly sharing a test build without going through the store.

### 5.2 iOS: no build profile exists yet

There's currently no iOS-specific build configuration. The default profile settings work, but the **first** `eas build --platform ios` run will prompt you (interactively) to either let EAS generate a distribution certificate + provisioning profile automatically (recommended — EAS manages Apple credentials for you once you're logged into the right Apple Developer account) or supply your own. Do this only after your Apple Developer account (§3.2) is approved.

### 5.3 Version numbers

`app.json` currently has `"version": "1.0.0"` and no `ios.buildNumber` / `android.versionCode`. Both stores require:
- **`version`** (e.g. `1.0.0`) — the human-readable version shown to users. Bump this for meaningful releases.
- **`android.versionCode`** — an integer that must strictly increase with every single upload to Play Console, even for the exact same `version` string. Add it explicitly, e.g. `"versionCode": 1`, and increment by 1 on every future submission.
- **`ios.buildNumber`** — same idea for Apple, e.g. `"buildNumber": "1"`, must increase every submission.

Since `cli.appVersionSource` is set to `"local"` in `eas.json`, EAS reads these straight from `app.json` rather than managing them remotely — so bumping them is a manual step you do before each store build.

### 5.4 App Store Connect / Play Console credentials for `eas submit`

EAS can push the finished build directly to both stores (`eas submit`) instead of you manually uploading files:

- **Android**: create a **Google Cloud Service Account**, grant it access in Play Console under **Setup → API access**, download its JSON key, and reference it from `eas.json`'s `submit.production.android.serviceAccountKeyPath`.
- **iOS**: either let `eas submit` prompt for your Apple ID + an app-specific password interactively, or generate an **App Store Connect API Key** (Users and Access → Keys) for non-interactive automation.

This is optional — you can always upload builds manually through each store's web console instead — but it's worth setting up once you're doing this more than a couple of times.

---

## 6. Step-by-Step: Google Play Store

1. **Create the app** in Play Console: Dashboard → **Create app** → enter name (`uktextiles`), default language, app or game → App, Free or Paid → Free.
2. **Complete "App content"** section (left sidebar) — this unlocks the rest of the console:
   - Privacy Policy URL (§4.4)
   - Ads (declare "No ads" if true)
   - App access (if login-gated, provide a **test account** — Employee Code + password — so reviewers can actually log in and test the app; this is mandatory for gated apps)
   - Content rating questionnaire (§4.6)
   - Target audience (adults / business use)
   - Data safety form (§4.5)
   - Government apps declaration (No, unless applicable)
3. **Store listing** (Main store listing): app name, short/full description, screenshots, feature graphic, icon, category = Business.
4. **Set up a release**:
   - Go to **Testing → Closed testing** (or **Production** if you're an existing verified developer with prior apps — new accounts are usually required to complete closed testing first, see the callout below).
   - Create a new release, upload the `.aab` from §5.1.
   - Add release notes (what's new in this version).
5. **⚠️ New-developer testing requirement**: Google requires accounts that haven't published an app before to run a **closed test with at least 12 opted-in testers, continuously, for 14 days** before production access unlocks. Plan for this — invite 12+ colleagues (their Google account emails) as testers as early as possible so the 14-day clock starts running while you finish the rest of this checklist.

   > 🔒 **Private distribution note:** if you're using Managed Google Play for a fixed employee list, this requirement doesn't block you the same way — a permanent Closed Testing track *is* your production for practical purposes; you're not required to ever "graduate" to the public Production track.
6. Once the release is reviewed and testing requirements are satisfied, **promote to Production** (or keep it on Closed Testing indefinitely if going the private route).
7. Submit for review.

## 7. Step-by-Step: Apple App Store

1. In **App Store Connect** ([appstoreconnect.apple.com](https://appstoreconnect.apple.com)) → **My Apps → + → New App**.
   - Platform: iOS.
   - Name: `uktextiles`.
   - Primary language.
   - Bundle ID: select `net.uktex.employee` (this must already exist under **Certificates, Identifiers & Profiles** in your Apple Developer account — EAS registers it automatically the first time you run an iOS build, or you can create it manually).
   - SKU: any internal unique string, e.g. `uktextiles-app-001`.
2. Fill in **App Information**: category (Business), content rights, age rating questionnaire (§4.6).
3. Fill in **App Privacy** (§4.5).
4. Add **Pricing and Availability** — Free, choose countries (India, or wherever employees are).
5. Prepare a version listing: screenshots (§4.2), description, keywords, support URL, marketing URL, privacy policy URL.
6. **Upload the build**: run `eas build --platform ios --profile production` (after §5.2 is set up), then either `eas submit -p ios` or upload the resulting `.ipa` manually via **Transporter** (Apple's free upload app) or Xcode.
7. Once the build finishes processing (can take 15 minutes–a few hours), attach it to your version in App Store Connect.
8. **Answer Export Compliance**: `app.json` already sets `ITSAppUsesNonExemptEncryption: false`, meaning the app only uses standard HTTPS encryption — App Store Connect should auto-answer this correctly, but confirm it during submission (a "No" to "does your app use encryption beyond HTTPS" keeps this simple).
9. Provide a **demo account** (Employee Code + password) in the "App Review Information" section — mandatory for login-gated apps, same reasoning as Google's App access step.
10. Add a note in "App Review Information → Notes" explaining what the app is (internal HR/attendance tool for UKTextiles employees) and specifically explaining the location/camera permission use case — this materially reduces the chance of a manual rejection or a reviewer-asks-clarifying-questions delay.
11. Click **Submit for Review**.

> 🔒 **Private distribution note (Custom Apps via Business Manager)**: instead of steps 4 and the public submission in step 11, you create the app as a **Custom App** scoped to your Apple Business Manager organization. The review is lighter (Apple still checks basic functionality/compliance) but the app never appears in public App Store search — only devices enrolled under your Business Manager org via MDM can install it.

---

## 8. Review & Verification Process

| | Google Play | Apple App Store |
|---|---|---|
| Typical first-review time | A few hours to 7 days (new developer accounts and apps requesting sensitive permissions like location are reviewed more thoroughly and can take longer) | 24–48 hours typically, occasionally longer |
| What's checked | Policy compliance, permissions justification, Data Safety accuracy, malware/security scan, functional testing (they will log in with your test account) | Guideline compliance (functionality, design, business model, legal — Guideline 5), permission usage matches stated purpose, they will log in and use the app |
| Location-permission apps specifically | May require you to submit a short screen recording showing exactly how/when location is used, especially if `ACCESS_BACKGROUND_LOCATION` is ever added (this app currently only uses foreground location) | Reviewers manually test that declining location doesn't break login/core flows, and that the usage matches your `NSLocationWhenInUseUsageDescription` text (already set clearly in `app.json`) |
| If rejected | You get a specific policy citation; fix and resubmit — doesn't reset your account standing for a first-time, good-faith fix | Same — Apple's rejection messages are usually specific; you can also request a call with a reviewer via the Resolution Center for ambiguous rejections |
| Update reviews | Typically faster than the first review once your account has a track record | Same |

Both stores' review teams sometimes need to actually **log into the app** to test it — this is exactly why the test/demo account (Employee Code + password) in both submission flows is mandatory, not optional paperwork. Make sure that account:
- Actually works on the live backend the store build points at (`https://hrms.uktextiles.in/api` per current `eas.json`).
- Has some real-ish sample data (a few attendance days, a leave request) so the app doesn't look broken/empty to a reviewer.
- Won't be deleted or have its password changed while your submission is pending.

---

## 9. Cost Breakdown

| Item | Cost | Frequency |
|---|---|---|
| Google Play Console registration | $25 USD | One-time |
| Apple Developer Program | $99 USD | Annual |
| Apple Developer Enterprise Program (only if going fully private/in-house) | $299 USD | Annual |
| D-U-N-S Number (Apple org enrollment) | Free | One-time |
| EAS Build (this project's existing build pipeline) | Free tier covers occasional builds; [Expo's paid plans](https://expo.dev/pricing) start if you need more concurrent/priority builds | Monthly, only if you exceed the free tier |
| Domain/hosting for the Privacy Policy page | Likely $0 if UKTextiles already has a website (`uktextiles.in`) to add a `/privacy` page to | — |
| Currency conversion / international card fees | Varies by bank, usually 1–3% | Per transaction |

**Total minimum to get both apps live**: roughly **$124 USD** ($25 Google + $99 Apple) plus $99/year to keep the iOS listing active going forward. Google's $25 is genuinely one-time.

---

## 10. Best Practices Before Launch

- **Test the exact build you're submitting**, not just `expo start` in dev mode. Install the actual `.aab`-derived APK (Play Console lets you download it) or the `.ipa` via TestFlight, on a real device, and walk through login → attendance punch → leave request → salary slip before submitting.
- **Use TestFlight (iOS) and Closed Testing (Android) as your real QA step**, not just a box to check for Google's requirement — get 5–10 real employees to use a pre-release build for a few days and report issues.
- **Write the demo/reviewer account notes assuming the reviewer knows nothing about UKTextiles** — spell out what the app is for in plain language.
- **Double-check the API URL** baked into the store build (`eas.json` → your production-store profile) points at the live, stable backend — not a dev/staging URL. A reviewer hitting a broken backend is one of the most common causes of rejection for backend-dependent apps.
- **Keep your keystore and Apple distribution certificate safe.** EAS manages both for you by default (stored on Expo's servers, tied to your account) — don't regenerate them casually; losing the Android keystore means you can never update the app under the same listing again, and would have to publish a brand new app.
- **Set up crash/error visibility** before launch if you don't have it already (e.g. Sentry) — you won't have the dev console to see errors once real employees are using a distributed build.
- **Have a support channel ready on day one** — an email address employees can actually reach when something breaks, checked by someone at UKTextiles, before you announce the app company-wide.

---

## 11. Common Mistakes to Avoid

- **Submitting an APK to Google Play instead of an AAB.** Play Console will reject the upload outright for new apps — see §5.1.
- **Forgetting to bump `versionCode` / `buildNumber` before rebuilding.** Both stores reject a re-upload with the same build number, even if the version string changed.
- **No test/demo account provided**, or the account's password gets changed while review is pending — this is one of the single most common rejection reasons for login-gated apps on both stores.
- **Privacy policy URL that's broken, behind a login, or doesn't mention location/camera at all.** Reviewers check this directly.
- **Mismatched permission justification.** If your Play Store Data Safety form or Apple App Privacy answers don't match what the app actually requests at runtime, that's a rejection (or a suspension after the fact if caught later, which is worse).
- **Publishing the app publicly when it should have been private/internal-only** (see §1) — beyond the review risk, it also means anyone in the world can find and attempt to log into UKTextiles' HR system, which is a security exposure worth avoiding even though login still gates real access.
- **Not testing on a real device before submitting.** Simulators/emulators don't always reflect real camera/GPS/permission-prompt behavior.
- **Ignoring the review rejection message and just resubmitting the same build.** Both stores' rejection reasons are specific — read them fully; guessing wastes review cycles (each resubmission goes through the same queue delay).
- **Losing access to the Apple ID or Google account tied to the developer account.** Use a company-controlled email, not a personal one, and store the credentials somewhere the company can recover (a password manager shared with IT/ops), not just one person's memory.

---

## 12. Additional Recommendations

- **Start the account verification steps (§3) today, in parallel with everything else** — D-U-N-S lookup and identity verification are the slowest parts of this whole process and don't depend on the app itself being finished.
- **Consider a staged rollout** on Google Play (release to 10% of users first, then increase) once you have a real user base, to catch issues before they hit everyone.
- **Version your releases predictably** — e.g. bump `version` for anything user-facing, always bump `versionCode`/`buildNumber` every single submission regardless.
- **Keep `DEPLOYMENT.md` and this file in sync** as your process evolves — if you add a `production-store` EAS profile per §5.1, document the exact profile name here and in `DEPLOYMENT.md` so future-you (or whoever takes this over) doesn't have to reverse-engineer it.
- **If you're unsure between public and private distribution, ask Apple/Google directly before submitting** — Apple's Developer Support and Google Play's policy support can both give guidance specific to your account before you burn a review cycle on a rejection.
- **Budget real calendar time, not just work time**: between D-U-N-S lookup, account verification, Google's 14-day closed-testing requirement, and review queues, the realistic timeline from "start today" to "live on both stores" is **3–6 weeks** for a first submission, even though the actual submission steps themselves take under a day of active work.

---

## 13. Command Cheat Sheet

```powershell
# Android — build a Play Store–ready App Bundle (after adding the profile from §5.1)
eas build --platform android --profile production-store

# iOS — build for App Store submission (after Apple account + credentials are set up, §5.2)
eas build --platform ios --profile production

# Submit the most recent build to each store (after configuring submit credentials, §5.4)
eas submit --platform android --profile production
eas submit --platform ios --profile production

# Check current build/submission status
eas build:list
eas submit:list
```
