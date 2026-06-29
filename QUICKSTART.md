# UKTextiles Employee App — Quick Start

## Run on Device

```bash
cd uktextiles-employee-app
npx expo start
```

Scan the QR code with **Expo Go** app on your Android phone.

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
