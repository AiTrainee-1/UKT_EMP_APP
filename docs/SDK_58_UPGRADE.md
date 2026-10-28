# Expo SDK 57 -> 58 upgrade (2026-10-28)

Why: Expo Go from the stores is SDK 58 only ("Project is incompatible with this version of Expo Go"). The project now runs on
SDK 58 (React Native 0.88, React 19.3). Nothing was committed; the working tree still contains the On-Duty tracking work.

Rollback point (before the upgrade): `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`, `babel.config.js` and
`eas.json` were copied first; restore them and run `npm ci`. Baseline before: `tsc` clean, 368 tests passing.

## Versions

| Package | SDK 57 | SDK 58 |
|---|---|---|
| expo | 57.0.20 | 58.0.20 |
| react-native | 0.86.3 | 0.88.0 |
| react / react-dom | 19.2.3 | 19.3.0 |
| expo-router | 57.0.19 | 58.0.27 |
| expo-location / expo-task-manager / expo-sqlite | 57.0.16 / 57.0.21 / 57.0.4 | 58.0.19 / 58.0.12 / 58.0.14 |
| expo-notifications | 57.0.17 | 58.1.6 |
| react-native-gesture-handler | 2.32.0 | 3.3.0 (major) |
| react-native-reanimated / worklets | 4.5.1 / 0.10.1 | 4.7.1 / 0.13.0 |
| react-native-webview | 13.16.1 | 14.0.1 |
| react-native-screens / safe-area-context | 4.26.2 / 5.7.0 | 4.30.0 / 5.10.1 |
| @react-native-community/datetimepicker | 9.1.0 | 9.2.1 |
| metro / babel-preset-expo / Hermes | 0.84.6 / 57.0.10 / 250829098.0.17 | 0.87.1 / 58.0.21 / 260318099.0.4 |
| @types/react | ~19.2.10 | ~19.3.0 |

Every other `expo-*` package moved to its `~58.x` version (`npx expo install --check` reports "up to date"). Node 22.13+, 24.3+
or 26+ is required (odd releases such as 23/25 are not supported); this machine has 24.17.

`package-lock.json` was regenerated from scratch: `npx expo install expo@^58 --fix` stopped on an `npm` peer-resolution error
(`@react-native-community/datetimepicker@9.2.1` has an optional peer `react-native-windows`, which `npm` tried to resolve against
the old lock), a fresh resolution does not hit it, so no `--force` / `--legacy-peer-deps` was used. As a side effect plain
dependencies floated inside their ranges (axios 1.20 -> 1.21, @tanstack/react-query 5.102 -> 5.105, react-hook-form 7.87 -> 7.91,
zod 4.5 -> 4.6, ...).

## What changed in SDK 58 that touches this app

| Area | Change (source) | Effect here |
|---|---|---|
| React Native 0.87 | Strict TypeScript API is the default; `react-native/Libraries/*` deep imports and old helper types are gone; refs use `ViewInstance`, `TextInputInstance`, `ScrollViewInstance` (RN 0.87 post, SDK 58 changelog) | 65 compile errors, all fixed (below) |
| React Native 0.87 | Removed `StatusBar` props `backgroundColor` / `translucent` / `networkActivityIndicatorVisible`, `Modal` `animated`, `InteractionManager`, `Touchable` export, boolean `keyboardShouldPersistTaps` (RN 0.87 post) | Only the `StatusBar` props were used; removed (no-ops under edge-to-edge anyway) |
| React Native 0.87 | `RefreshControl.onRefresh` must return `void \| Promise<void>`; list `ListHeaderComponent` no longer accepts `null`; `useColorScheme` / `Appearance` never return `'unspecified'` (types) | Fixed in 14 screens + `ThemeProvider` |
| React Native 0.88 | "No user-facing breaking changes"; events now go through the W3C EventTarget model; `InitializeCore` deprecated (RN 0.88 post) | Nothing to do |
| expo-router | Navigation core rewritten; custom `tabBar` now receives `emitter` + `navigateToTab` instead of `navigation`; `withLayoutContext` deprecated; server output default when `web.output` is unset (SDK 58 changelog) | `GlassTabBar` updated (unused by the layout, kept compiling). Native app unaffected; `expo export --platform web` still works |
| react-native-gesture-handler 3 | The legacy `Swipeable` is no longer exported by 3.3 (TS2305 here); `ReanimatedSwipeable` is its replacement (RNGH 3 upgrade guide) | Chat screen switched to `ReanimatedSwipeable` |
| expo-task-manager | `defineTask` after the bundle finished loading now warns (package CHANGELOG 58.0.0) | `src/tracking/collector.ts` defines the task at module scope from `index.ts`: correct, no change |
| expo-location | Classic API unchanged; a new `expo-location/next` API is added; background updates / foreground service work for the classic API as before (SDK 58 changelog, Location docs, package CHANGELOG) | `collector.ts`, `permissions.ts`, `probe.ts` unchanged |
| expo-notifications | Foreground notifications show by default, a slow handler no longer drops the notification; `shouldShowAlert` is deprecated (changelog, Notifications docs) | `useNotifications.ts` already sets `shouldShowBanner` / `shouldShowList`; `shouldShowAlert: true` left in (deprecated, still accepted) |
| expo-sqlite | libSQL removed (`syncLibSQL`, `libSQLOptions`, `useLibSQL` plugin option) (changelog, package CHANGELOG) | Not used; `src/tracking/platform/sqlite.ts` uses `openDatabaseAsync` / `runAsync` / `getAllAsync` / `getFirstAsync`, all still current |
| expo-file-system | `File.write()` and `FileHandle.read/writeBytes` are now async (changelog) | Only `File.downloadFileAsync` / `new File()` used: no change |
| expo-constants | `Constants.appOwnership` is deprecated in favour of `executionEnvironment` | 3 Expo Go guards (`useNotifications`, `usePushToken`, `tracking/platform/probe`) still compile and read the native value; migrate later |
| Android build | R8 minification is on by default in release builds (`android.enableMinifyInReleaseBuilds=true`); reflection-based libraries may need keep rules (changelog) | **Untested here** (no native build was run). If a release APK misbehaves, set `enableMinifyInReleaseBuilds: false` through the `expo-build-properties` plugin in `app.json` |
| CLI | `NODE_ENV` is forced to development/production by command; `.env.<NODE_ENV>` selection follows it (changelog) | Only `.env` is used: no effect |
| EAS Build | `auto` image resolves to `sdk-58` (Android Ubuntu 26.04, JDK 17, Node 22.23) (EAS infrastructure docs) | `eas.json` unchanged; `cli.version >= 16.0.0` is still satisfied (no newer minimum is documented) |

## Source changes made (all type-level or API-forced; no feature was rewritten)

- `package.json`, `package-lock.json`: versions above, `@types/react` ~19.3.0, `expo` `^58.0.20`.
- `tsconfig.json`: `"files": ["src/types/react-native-legacy-types.ts"]` (must be read first, see below).
- `src/types/react-native-legacy-types.ts` (new, types only): React Native 0.87 stopped exporting `AnimatableNumericValue`,
  `FlexAlignType` and the twelve `*Transform` types that Moti's declaration files import, so every Moti `transition={{ type:
  'timing' ... }}` failed to compile. The file puts the same names back (definitions from `react-native/types_DEPRECATED`).
  TypeScript only applied it when it was read before the app's files, hence the `files` entry. Delete both once Moti is updated.
  (The documented alternative is `customConditions: ["react-native", "react-native-legacy-deep-imports"]` in `tsconfig.json`,
  which switches all of `react-native` back to the old types and is removed after RN 0.89; not used.)
- `src/lib/webview.ts` (new): `react-native-webview` 14 declares `class WebView<P = undefined> extends Component<WebViewProps & P>`;
  `WebViewProps & undefined` is `never`, which the strict API no longer hides. It re-exports the same runtime component with its
  real props/ref type. Used by `LightfallView.tsx` (login header) and `tracking/JourneyMap.tsx`.
- `app/**`: `StatusBar` `backgroundColor` / `translucent` removed (14 screens + `AuthShell`); `onRefresh={refetch}` ->
  `onRefresh={() => { void refetch(); }}` (14 screens); `onSubmitEditing={handleSubmit(fn)}` -> `() => { void handleSubmit(fn)(); }`
  (login, set-password) and the same for one `TouchableOpacity` in resignation/survey; `ListHeaderComponent` `null` -> `undefined`
  (documents, settlement); chat `Swipeable` -> `ReanimatedSwipeable` (`SwipeableMethods` ref type).
- `src/components`: `FormScrollView` / `KeyboardAvoider` / `Input` / `AuthInput` ref types -> `ScrollViewInstance` / `ViewInstance` /
  `TextInputInstance`; `DockTabIcon` casts the opaque RN `ColorValue` to `string` where it reaches the icon font; `GlassTabBar` uses
  `emitter` + `navigateToTab`; `ThemeProvider` keeps a nullable system colour scheme instead of `'unspecified'`.
- `app.json`, `eas.json`, `babel.config.js`: unchanged (the tracking permissions and plugin options are kept as they were).

## Verification done

`npx tsc --noEmit` clean; `npm test` 368/368; `npx expo install --check` up to date; `npx expo config --type introspect` ok (all
plugins and android permissions present); `npx expo export --platform android` (Hermes bytecode, 3254 modules) and
`--platform web` bundle without warnings. `npx expo-doctor`: 19 of 20 checks pass; the one failure is old and unrelated to the
upgrade: `assets/icon.png` and the three `android-icon-*.png` files are 1536x1024, not square (note that
`androidForegroundServiceIcon` also points at such a file; the plugin wants a 96x96 white PNG: check the notification icon on a
real build). The repo has no lint script.

## Not verified (needs a phone / a native build)

- Nothing was run on a device or in Expo Go: no screen was opened at runtime, so React 19.3 / Reanimated 4.7 / the rewritten
  expo-router core / `ReanimatedSwipeable` (chat swipe-to-reply) are build- and type-checked only.
- Everything native: background location, foreground service notification, boot receiver, battery-optimisation intents, the
  Android R8 default and the config-plugin output. A native build was not started (no EAS build was run).

## Expo Go vs a development build

Expo Go (SDK 58) can open the project: every native module the app uses is in Expo Go's bundled set (`expo/bundledNativeModules.json`)
and the rest is plain JavaScript. What it cannot do (Expo docs, SDK 58):

- Location docs: "You must use a development build to use background location since it is not supported in the Expo Go app."
  and "Foreground and background services are not available in Expo Go for Android." So the On-Duty route recording
  (background task + foreground service) does not run in Expo Go. How the tracking setup/health screens present that failure in
  Expo Go was not observed.
- Task Manager docs: "With Expo Go, TaskManager is not available on Android, and does not support background execution on iOS."
- Notifications docs: push notifications are unavailable in Expo Go on Android since SDK 53 (the app already guards this with
  `Constants.appOwnership === 'expo'`).
- `app.json` `android.permissions` and the config plugins (`expo-location` foreground-service options, `expo-notifications`
  icon, `expo-build-properties` cleartext traffic) only exist in a real build, not in Expo Go.

### Development build (needed to test tracking on a phone)

`eas.json` already has a `development` profile (`developmentClient: true`, internal APK) but `expo-dev-client` is not in
`package.json` yet; Expo's guide installs it first:

```powershell
cd D:\Projects\UK-textile-Mobi\uktextiles-employee-app
npx expo install expo-dev-client                         # one time, installs the SDK 58 version (~58.0.16)
eas login                                                # if not logged in
eas build --platform android --profile development       # cloud build, then install the APK it links to
npx expo start --dev-client                              # Metro on the PC; open the installed app and pick the server
```

The JavaScript is served by Metro, so the API address comes from `.env` (`EXPO_PUBLIC_API_URL`), not from `eas.json`.
`eas build --profile production` (or `preview`) is the way to test the real, minified (R8) APK.

## Sources

- Expo SDK 58 changelog: https://expo.dev/changelog/sdk-58
- Upgrade walkthrough: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- React Native 0.87: https://reactnative.dev/blog/2026/08/11/react-native-0.87 ; 0.88: https://reactnative.dev/blog/2026/10/19/react-native-0.88
- SDK 58 reference: https://docs.expo.dev/versions/v58.0.0/ (sdk/location, sdk/task-manager, sdk/notifications, sdk/sqlite)
- Gesture Handler 3: https://docs.swmansion.com/react-native-gesture-handler/docs/guides/upgrading-to-3/
- EAS build images: https://docs.expo.dev/build-reference/infrastructure/ ; development builds: https://docs.expo.dev/develop/development-builds/create-a-build/
- Package CHANGELOGs shipped in `node_modules` (expo-task-manager, expo-sqlite, expo-notifications, expo-file-system, expo-location).
