// What each Android brand needs so it does not kill a background app, and the settings screens that fix it. Pure: the
// launcher (platform/intents.ts) only runs the intents listed here, trying each until one opens.
//
// The component names are the long-standing ones used by the major brands' security / battery apps (the same list battery
// tips sites such as dontkillmyapp.com document). They differ by model and OS version and cannot be verified without each
// phone, so EVERY guide ends with the generic "App info" screen, which always exists, and the written steps are the real
// instructions; the deep link only saves a few taps.

export type OemKey = 'xiaomi' | 'oppo' | 'vivo' | 'samsung' | 'huawei' | 'other';

export interface IntentSpec {
  /** Intent action; usually android.intent.action.MAIN with an explicit component. */
  action: string;
  packageName?: string;
  className?: string;
  extra?: Record<string, string | number | boolean>;
  data?: string;
  /** Shown on the button for this attempt, when it is more specific than the guide's own. */
  label?: string;
}

export interface OemGuide {
  key: OemKey;
  name: string;
  /** Why this brand needs extra steps. */
  intro: string;
  steps: string[];
  /** Tried in order until one opens. */
  intents: IntentSpec[];
}

const MAIN = 'android.intent.action.MAIN';
export const APP_DETAILS_ACTION = 'android.settings.APPLICATION_DETAILS_SETTINGS';

export function detectOem(brand: string | null | undefined, manufacturer?: string | null): OemKey {
  const b = `${brand ?? ''} ${manufacturer ?? ''}`.toLowerCase();
  if (/xiaomi|redmi|poco|blackshark/.test(b)) return 'xiaomi';
  if (/oppo|realme|oneplus|one plus/.test(b)) return 'oppo';
  if (/vivo|iqoo/.test(b)) return 'vivo';
  if (/samsung/.test(b)) return 'samsung';
  if (/huawei|honor/.test(b)) return 'huawei';
  return 'other';
}

/** The always-present fallback: this app's own "App info" page. */
export function appDetailsIntent(packageName: string): IntentSpec {
  return { action: APP_DETAILS_ACTION, data: `package:${packageName}`, label: 'Open App info' };
}

export function oemGuide(key: OemKey, packageName: string, appLabel: string): OemGuide {
  const app = appLabel;
  const fallback = appDetailsIntent(packageName);
  switch (key) {
    case 'xiaomi':
      return {
        key,
        name: 'Xiaomi / Redmi / POCO',
        intro: 'MIUI and HyperOS stop background apps aggressively unless they are allowed to autostart and run without restrictions.',
        steps: [
          `Settings > Apps > Manage apps > ${app} > turn Autostart ON.`,
          `In the same page open Battery saver and choose No restrictions.`,
          `Open Recent apps, then touch and hold the ${app} card and tap the lock icon so it is not cleared.`,
        ],
        intents: [
          { action: MAIN, packageName: 'com.miui.securitycenter', className: 'com.miui.permcenter.autostart.AutoStartManagementActivity', label: 'Open Autostart' },
          {
            action: MAIN,
            packageName: 'com.miui.powerkeeper',
            className: 'com.miui.powerkeeper.ui.HiddenAppsConfigActivity',
            extra: { package_name: packageName, package_label: appLabel },
            label: 'Open battery saver for this app',
          },
          fallback,
        ],
      };
    case 'oppo':
      return {
        key,
        name: 'Oppo / Realme / OnePlus',
        intro: 'ColorOS and OxygenOS close apps that are not allowed to start by themselves or run in the background.',
        steps: [
          `Settings > Apps > App management > ${app} > turn Allow auto-start ON.`,
          `Settings > Battery > ${app} (or "More battery settings") > allow Background activity / choose Don't optimise.`,
          `Open Recent apps and lock the ${app} card.`,
        ],
        intents: [
          { action: MAIN, packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity', label: 'Open Auto-start' },
          { action: MAIN, packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.startupapp.StartupAppListActivity', label: 'Open Auto-start' },
          { action: MAIN, packageName: 'com.oppo.safe', className: 'com.oppo.safe.permission.startup.StartupAppListActivity', label: 'Open Auto-start' },
          { action: MAIN, packageName: 'com.oneplus.security', className: 'com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity', label: 'Open Auto-launch' },
          fallback,
        ],
      };
    case 'vivo':
      return {
        key,
        name: 'Vivo / iQOO',
        intro: 'Funtouch OS and OriginOS limit background activity and block autostart for apps that are not allowed.',
        steps: [
          `Settings > Battery > Background power consumption management > ${app} > Allow high background power consumption.`,
          `i Manager (or Settings) > Apps > Autostart > turn ${app} ON.`,
          `Open Recent apps and lock the ${app} card.`,
        ],
        intents: [
          { action: MAIN, packageName: 'com.vivo.permissionmanager', className: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity', label: 'Open Autostart' },
          { action: MAIN, packageName: 'com.iqoo.secure', className: 'com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity', label: 'Open background power settings' },
          { action: MAIN, packageName: 'com.iqoo.secure', className: 'com.iqoo.secure.ui.phoneoptimize.BgStartUpManager', label: 'Open Autostart' },
          fallback,
        ],
      };
    case 'samsung':
      return {
        key,
        name: 'Samsung',
        intro: 'One UI puts apps you do not open often to sleep, which stops their background services.',
        steps: [
          `Settings > Apps > ${app} > Battery > choose Unrestricted.`,
          `Settings > Battery > Background usage limits: switch OFF "Put unused apps to sleep" and make sure ${app} is not in Sleeping apps or Deep sleeping apps (add it to Never sleeping apps).`,
        ],
        intents: [
          { action: MAIN, packageName: 'com.samsung.android.lool', className: 'com.samsung.android.sm.battery.ui.BatteryActivity', label: 'Open Battery settings' },
          { action: MAIN, packageName: 'com.samsung.android.sm_cn', className: 'com.samsung.android.sm.ui.battery.BatteryActivity', label: 'Open Battery settings' },
          fallback,
        ],
      };
    case 'huawei':
      return {
        key,
        name: 'Huawei / Honor',
        intro: 'EMUI and Magic UI close background apps unless they are managed manually.',
        steps: [
          `Settings > Battery > App launch > ${app} > turn Manage automatically OFF, then allow Auto-launch, Secondary launch and Run in background.`,
          `Open Recent apps and lock the ${app} card.`,
        ],
        intents: [
          { action: MAIN, packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity', label: 'Open App launch' },
          { action: MAIN, packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.optimize.process.ProtectActivity', label: 'Open protected apps' },
          fallback,
        ],
      };
    default:
      return {
        key: 'other',
        name: 'Your phone',
        intro: 'Most phones stop background apps to save battery unless you exempt them.',
        steps: [
          `Settings > Apps > ${app} > Battery > choose Unrestricted (or "Don't optimise").`,
          `If your phone has Autostart or Background activity settings, allow them for ${app}.`,
          `Open Recent apps and lock the ${app} card if your phone offers it.`,
        ],
        intents: [fallback],
      };
  }
}

/**
 * The generic first choice for battery optimisation: the system dialog "Allow UKTextiles to always run in the
 * background?" (needs the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission declared in app.json), then the list of all apps.
 */
export function batteryOptimisationIntents(packageName: string): IntentSpec[] {
  return [
    { action: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', data: `package:${packageName}`, label: 'Allow background activity' },
    { action: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS', label: 'Open battery optimisation list' },
    appDetailsIntent(packageName),
  ];
}

/** Android's "location source" screen, for "Phone location is switched off". */
export const LOCATION_SETTINGS_INTENT: IntentSpec = { action: 'android.settings.LOCATION_SOURCE_SETTINGS', label: 'Open Location settings' };
