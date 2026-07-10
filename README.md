# UKTextiles Employee App

React Native mobile app for UKTextiles employees. Built with Expo SDK 54 and expo-router. Connects to the Django REST API running on your local network.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Pages & Features](#pages--features)
- [API Endpoints Used](#api-endpoints-used)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Building the APK](#building-the-apk)
- [Known Notes](#known-notes)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native via Expo SDK 54 |
| Navigation | expo-router v6 (file-based routing) |
| Server State | @tanstack/react-query v5 |
| Forms | react-hook-form v7 + Zod v4 validation |
| HTTP Client | Axios (auto camelCase ↔ snake_case conversion) |
| Auth Storage | expo-secure-store (JWT token) |
| Date/Time Pickers | @react-native-community/datetimepicker |
| Icons | @expo/vector-icons (MaterialCommunityIcons) |
| Animations | react-native-reanimated + moti |
| Language | TypeScript |

---

## Project Structure

```
uktextiles-employee-app/
├── app/                          # All screens (expo-router file-based)
│   ├── _layout.tsx               # Root layout — auth context, error boundary
│   ├── index.tsx                 # Entry redirect (→ home or login)
│   ├── (auth)/
│   │   ├── login.tsx             # Login screen
│   │   └── set-password.tsx      # First-time password setup
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Bottom tab bar (Home, Attendance, Leave, Approvals*, Profile)
│   │   ├── home.tsx              # Dashboard home
│   │   ├── attendance.tsx        # Monthly attendance + calendar
│   │   ├── leave.tsx             # Leave balances + apply leave
│   │   ├── approvals.tsx         # Manager approvals (* only shown to managers)
│   │   └── profile.tsx           # Employee profile
│   ├── requests/
│   │   └── index.tsx             # Permission request form (Early Out / Late In / Short Leave)
│   ├── salary/
│   │   ├── index.tsx             # Salary slip list
│   │   └── [id].tsx              # Individual salary slip detail
│   ├── shift/
│   │   └── index.tsx             # Shift schedule
│   ├── holidays/
│   │   └── index.tsx             # Holiday calendar
│   └── settlement/
│       └── index.tsx             # Full & final settlement details
│
├── src/
│   ├── lib/
│   │   ├── api.ts                # Axios instance — auto snake_case↔camelCase, JWT header, 401 redirect
│   │   └── auth.ts               # Token/employeeId storage helpers (expo-secure-store)
│   ├── hooks/                    # React Query data hooks
│   │   ├── useAuth.ts            # Auth context + login/logout/checkAuth
│   │   ├── useAttendance.ts      # Monthly attendance records + summary
│   │   ├── useDashboard.ts       # Home screen summary data
│   │   ├── useEmployee.ts        # Employee profile details
│   │   ├── useHolidays.ts        # Company holiday list
│   │   ├── useLeave.ts           # Leave balances, requests, types, apply leave
│   │   ├── useManager.ts         # Manager profile, pending requests, approve/reject
│   │   ├── useNotifications.ts   # Push notification helpers (no-op in Expo Go)
│   │   ├── useRequests.ts        # Permission requests (Early Out / Late In / Short Leave)
│   │   ├── useSalarySlips.ts     # Salary slip list and detail
│   │   ├── useShift.ts           # Employee shift schedule
│   │   └── useAdvances.ts        # Salary advances
│   ├── components/
│   │   ├── AttendanceCalendar.tsx # Color-coded monthly attendance calendar
│   │   ├── LeaveCard.tsx          # Leave request card UI
│   │   ├── ProfileSection.tsx     # Profile info section
│   │   ├── SalarySlipCard.tsx     # Salary slip summary card
│   │   └── ui/                    # Reusable UI components
│   │       ├── Badge.tsx          # Status badge (Pending / Approved / Rejected)
│   │       ├── BottomSheet.tsx    # Slide-up modal sheet
│   │       ├── Button.tsx         # Primary button with loading state
│   │       ├── Card.tsx           # Dark card container
│   │       ├── DatePickerField.tsx # Date + Time pickers (native calendar/clock dialogs)
│   │       ├── EmptyState.tsx     # Empty list illustration
│   │       ├── Input.tsx          # Text input with label + error
│   │       ├── Skeleton.tsx       # Loading skeleton cards
│   │       └── Toast.tsx          # Success / error toast notification
│   └── constants/
│       ├── colors.ts             # App color palette (dark theme)
│       └── theme.ts              # Shared spacing / font sizes
│
├── assets/                       # Icons, splash screen images
├── .env                          # Local dev environment variables
├── app.json                      # Expo app configuration
├── eas.json                      # EAS Build profiles (preview + production → APK)
└── package.json
```

---

## Pages & Features

### Login — `app/(auth)/login.tsx`

- Employee enters their **Employee Code** (e.g. `30020`) and **Password**
- Calls `POST /api/auth/employee-login`
- JWT token is saved securely using `expo-secure-store`
- On success, redirects to Home tab
- Forgot password link available

---

### Set Password — `app/(auth)/set-password.tsx`

- Shown to employees logging in for the first time
- Employee sets a new password for their account

---

### Home — `app/(tabs)/home.tsx`

The main dashboard. Shows:

| Card | Data |
|---|---|
| Present Days | Total present days this month |
| Absent Days | Total absent days this month |
| Leave Balance | Remaining leave days |
| Pending Requests | Count of pending leave + permission requests |

Also includes **Quick Actions** buttons:
- **Permission** → opens Permission Request form
- **Leave** → opens Apply Leave tab
- **Salary** → opens Salary Slip list
- **Shift** → opens Shift schedule

---

### Attendance — `app/(tabs)/attendance.tsx`

- Shows the **current month** attendance
- **Color-coded calendar**:
  - 🟢 Green = Present
  - 🔴 Red = Absent
  - 🟡 Yellow = Late
  - 🔵 Blue = On Leave
  - ⚫ Grey = Holiday / Sunday
- Tap any day → bottom sheet shows **First Punch In**, **Last Punch Out**, **Total Punches**
- Month summary bar showing Present / Absent / Late / On Leave counts
- Swipe or navigate months to view history

---

### Leave — `app/(tabs)/leave.tsx`

Two sections:

**Leave Balances** — shows remaining days per leave type (Annual, Sick, Casual, etc.)

**Apply Leave form**:
- Select Leave Type (chips: Annual Leave, Sick Leave, Casual Leave, Emergency Leave, Maternity Leave, Paternity Leave)
- Pick Start Date and End Date (native calendar picker)
- Enter reason (minimum 5 characters)
- All fields are required — shows inline validation messages if empty
- Submits to `POST /api/leave-requests`

**My Requests** — list of past leave requests with status badges (Pending / Approved / Rejected)

---

### Approvals — `app/(tabs)/approvals.tsx`

> **Only visible to employees who are assigned as managers in the HR Portal.**

Managers use this screen to approve or reject team requests.

- Two tabs: **Leave Requests** and **Permission Requests**
- Each card shows employee name, code, request type, dates, and reason
- Tap a card → bottom sheet with full details + optional comment field
- **Approve** button → calls `PATCH /api/manager/leave-requests/{id}/status` with `{ status: "approved" }`
- **Reject** button → calls `PATCH /api/manager/permissions/{id}/status` with `{ status: "rejected" }`
- Tab badge shows live count of pending requests
- Auto-refreshes every **30 seconds**

---

### Profile — `app/(tabs)/profile.tsx`

Displays employee personal and job information:
- Name, Employee Code, Department, Designation
- Shift timings, Date of Joining
- Contact details
- Logout button

---

### Permission Request — `app/requests/index.tsx`

For requesting short absences (not full-day leave):

- **Type** (chips): Early Out / Late In / Short Leave
- **Date** — native calendar picker
- **Time** — native clock picker
- **Reason** — text input
- All fields required with inline validation
- Submits to `POST /api/permissions`

---

### Salary Slips — `app/salary/index.tsx` and `app/salary/[id].tsx`

- **List screen**: shows all available monthly salary slips
- **Detail screen**: full salary slip with earnings breakdown, deductions, and net pay
- Accessible from Quick Actions on Home

---

### Shift Schedule — `app/shift/index.tsx`

- Shows the employee's assigned shift
- Displays shift name, start time, end time, and grace period details

---

### Holidays — `app/holidays/index.tsx`

- Lists all company-declared holidays for the year
- Shows date, holiday name, and day of week
- Sundays are automatically marked as holidays in the attendance calendar

---

### Settlement — `app/settlement/index.tsx`

- Shows Full & Final Settlement details if applicable
- Displays settlement amount, deductions, and status

---

## API Endpoints Used

All requests go to `EXPO_PUBLIC_API_URL` (default: `http://192.168.0.56:8000/api`).

The Axios instance in `src/lib/api.ts` automatically:
- Adds `Authorization: Bearer <token>` header to every request
- Converts response fields from `snake_case` → `camelCase`
- Converts request body fields from `camelCase` → `snake_case`
- Redirects to Login on 401 Unauthorized

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/employee-login` | Login |
| GET | `/auth/me` | Verify token |
| GET | `/employees/{id}` | Employee profile |
| GET | `/dashboard/employee-summary` | Home screen stats |
| GET | `/attendance/employee/{id}?month=&year=` | Monthly attendance |
| GET | `/leave-balances` | Leave balance per type |
| GET | `/leave-requests` | My leave history |
| POST | `/leave-requests` | Apply leave |
| GET | `/leave-types` | Available leave types |
| GET | `/permissions` | My permission history |
| POST | `/permissions` | Apply permission |
| GET | `/salary-slips` | Salary slip list |
| GET | `/salary-slips/{id}` | Salary slip detail |
| GET | `/shift` | Shift details |
| GET | `/holidays` | Holiday list |
| GET | `/settlement` | Settlement details |
| GET | `/manager/me` | Manager profile + pending count |
| GET | `/manager/pending-requests` | Team's pending requests |
| PATCH | `/manager/leave-requests/{id}/status` | Approve/reject leave |
| PATCH | `/manager/permissions/{id}/status` | Approve/reject permission |

---

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Django API base URL (must start with `EXPO_PUBLIC_`) |
| `EXPO_PUBLIC_APP_NAME` | App display name |

**For local development** — edit `.env`:
```
EXPO_PUBLIC_API_URL=http://192.168.0.56:8000/api
EXPO_PUBLIC_APP_NAME=UKTextiles
```

**For APK builds** — the `.env` file is not included. Values are injected via `eas.json`:
```json
"env": {
  "EXPO_PUBLIC_API_URL": "http://192.168.0.56:8000/api"
}
```

> **Important:** The phone must be connected to the same WiFi network as the Django server for the app to work. `usesCleartextTraffic: true` is set in `app.json` to allow HTTP (non-HTTPS) connections on Android.

---

## Local Development Setup

### Prerequisites

- Node.js 18 or later
- [Expo Go](https://expo.dev/go) app installed on your phone (SDK 54)
- Django server running at `http://192.168.0.56:8000`

### Steps

```powershell
# 1. Install dependencies
cd uktextiles-employee-app
npm install

# 2. Start the development server
npx expo start

# 3. Scan the QR code with Expo Go on your phone
```

Your phone and the PC must be on the same WiFi network.

---

## Building the APK

### First-time setup (do once)

```powershell
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account (create one at expo.dev if needed)
eas login

# Link this project to your Expo account
eas init
```

### Build APK

```powershell
eas build --platform android --profile production
```

- Build runs on Expo's cloud servers (~10–15 minutes)
- When complete, download the `.apk` from the link shown in the terminal or from [expo.dev](https://expo.dev)
- Transfer APK to phone via USB / WhatsApp / Google Drive
- On the phone: **Settings → Install unknown apps → allow your file manager → Install**

### Build profiles in `eas.json`

| Profile | Output | Use for |
|---|---|---|
| `preview` | APK | Internal testing |
| `production` | APK | Distribution to employees |
| `development` | APK (dev client) | Debug builds |

---

## Known Notes

- **Push notifications** are disabled in Expo Go (SDK 53+ restriction). They will work in a proper APK build.
- **Leave types**: If the backend `/api/leave-types` returns an empty list, the app shows 6 built-in defaults (Annual, Sick, Casual, Emergency, Maternity, Paternity Leave). Add real leave types through the HR Portal admin.
- **Manager tab**: The Approvals tab only appears if the logged-in employee is assigned as a manager in the HR Portal (User Management → Department Managers).
- **`expo doctor` warning** about `usesCleartextTraffic`: this is a false-positive schema validation warning. The field works correctly and is required for HTTP connections to the local server.
