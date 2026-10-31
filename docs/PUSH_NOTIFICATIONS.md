# Phone notifications (outside the app)

Every message HR sends is saved inside the app and also pushed to the phone's notification bar, so it shows on the lock
screen even when the app is closed, like WhatsApp. The push travels: **HR server → Expo → Google (Firebase) → the phone**.

The server and the app code are ready. What a build needs on top is **Firebase**, which only the company's Google account can
create. Without it Android never gives the app a push address, so notifications stay inside the app and the Notifications
screen shows "This build cannot receive phone notifications yet".

## One-time setup (about 20 minutes)

1. **Firebase project.** Open <https://console.firebase.google.com> with the company Google account, press *Add project*
   (any name, Analytics can be off).
2. **Android app.** In the project: *Add app → Android*. Package name must be exactly `net.uktex.employee`. Register it, then
   **download `google-services.json`** and put it in this folder (next to `app.json`). `app.config.js` picks it up by itself.
3. **Service-account key for Expo.** Firebase console → *Project settings → Service accounts → Generate new private key*
   (a `.json` file). Keep it private; never commit it.
4. **Give that key to Expo.** In this folder run:

   ```bash
   eas credentials
   ```

   Choose *Android → production → Google Service Account → Manage your Google Service Account Key for Push Notifications
   (FCM V1) → Set up a Google Service Account Key for FCM V1* and select the file from step 3.
5. **Build and install a new APK** (the old APK has no Firebase inside, it can never receive push):

   ```bash
   eas build -p android --profile production
   ```

6. On the phone: install it, log in, press **Allow** on the notification question.

## Checking that it works

- HR portal → *Mobile App Login → Mobile Messages → Phones*: the employee shows **1 phone**.
- *Mobile Messages → Send a message*: send a test to that employee with the app closed. The message log changes from
  **Sent** to **Delivered to the phone** after about a minute. **Push failed** shows the reason in words
  (for example "Expo has no Firebase key for this app").
- On the phone, the Notifications screen shows a yellow bar with the exact reason whenever something is missing.

## If a phone still shows nothing

- *Settings → Apps → UKTextiles → Notifications* must be on (the yellow bar's **Open settings** button goes there).
- Some brands (Xiaomi/Redmi/Oppo/Vivo/Realme/Samsung power saving) kill closed apps: set the app's battery use to
  **Unrestricted / No restrictions** and allow **Autostart**.
- A phone with no internet receives the push as soon as it is back online (Google keeps it waiting for the
  phone for a while).
