# UKTextiles Employee App — Quick Start

## Run on Device

```bash
cd uktextiles-employee-app
npx expo start
```

Scan the QR code with **Expo Go** app on your Android phone. The project is on **Expo SDK 58**, so the phone needs the SDK 58
version of Expo Go (Expo Go only opens projects of its own SDK).

> On-Duty route tracking (background location) does not run in Expo Go; it needs a development build:
> `npx expo install expo-dev-client`, then `eas build --platform android --profile development` (see `docs/SDK_58_UPGRADE.md`).

> **Phone must be on the same Wi-Fi network as the server (192.168.0.x)**

## First-Time Login

1. Tap **"First time? Set your password"**
2. Enter your Employee Code (e.g. `30020`)
3. Set a password (min 8 characters)
4. Return to Login and sign in

## API Server

- Backend: `http://192.168.0.5:8000/api`
- Change this in `.env` → `EXPO_PUBLIC_API_URL`

## Clear Cache (if needed)

```bash
npx expo start --clear
```
