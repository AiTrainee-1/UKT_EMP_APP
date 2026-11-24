// Background sync of the offline queue (src/offline/engine.ts) while the app is closed, where Android allows it.
//
// THIS FILE MUST BE IMPORTED AT THE APP'S ENTRY (index.ts), like src/tracking/collector.ts: TaskManager.defineTask has to
// run at module scope on every start of the JavaScript bundle, because the OS starts the bundle headlessly (no screens) to
// run the task. expo-background-task (Android WorkManager) runs it at most every 15 minutes, only with a network
// connection and enough battery; the OS decides the exact moment. An On-Duty session additionally keeps the app alive with
// its own foreground service, so the queue is also sent from the open app the moment the internet is back.
import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { syncNow } from './engine';

export const OFFLINE_SYNC_TASK = 'uktextiles-offline-sync';
const MINIMUM_INTERVAL_MINUTES = 15;

if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(OFFLINE_SYNC_TASK, async () => {
      try {
        await syncNow('background');
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch {
    // An old build without the native module: the in-app sync still works.
  }
}

/** Schedules the background sync (idempotent; the registration survives restarts). Never throws. */
export async function registerOfflineSyncTask(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const available = await BackgroundTask.getStatusAsync();
    if (available !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(OFFLINE_SYNC_TASK)) return;
    await BackgroundTask.registerTaskAsync(OFFLINE_SYNC_TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES });
  } catch {
    /* not available on this build / phone: the in-app sync covers it */
  }
}
