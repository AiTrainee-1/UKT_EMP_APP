/**
 * "Download" a card as a picture (owner 2026-11-24: the gate pass card can be downloaded as an image). The card's own
 * view is captured as a PNG (react-native-view-shot) and saved to the phone's photos (expo-media-library, write-only
 * permission: nothing in the gallery is read). If saving is refused or not possible, the phone's share sheet opens
 * instead (Save to Files / WhatsApp / Drive ...), so the employee always gets the picture somewhere.
 *
 * Both are native modules: an app build from before them cannot download (the message says to update the app).
 */
import type { RefObject } from 'react';
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export type SaveOutcome = 'saved' | 'shared' | 'cancelled' | 'unavailable';

export async function saveCardImage(ref: RefObject<unknown>, fileName: string): Promise<SaveOutcome> {
  let uri: string;
  try {
    uri = await captureRef(ref as any, { format: 'png', quality: 1, result: 'tmpfile', fileName: fileName.replace(/\.png$/, '') });
  } catch {
    return 'unavailable';
  }

  if (Platform.OS !== 'web') {
    try {
      const MediaLibrary = await import('expo-media-library');
      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (permission.granted) {
        await MediaLibrary.Asset.create(uri);
        return 'saved';
      }
    } catch {
      // no media library on this build, or the save failed: offer the share sheet instead
    }
  }

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Save your gate pass', UTI: 'public.png' });
      return 'shared';
    }
  } catch {
    return 'cancelled';
  }
  return 'unavailable';
}

export function saveOutcomeMessage(outcome: SaveOutcome): string | null {
  switch (outcome) {
    case 'saved':
      return 'Gate pass saved to your photos.';
    case 'shared':
      return null; // the share sheet itself was the answer
    case 'cancelled':
      return null;
    default:
      return 'Could not save the picture on this phone. Please update the UKTextiles app and try again.';
  }
}
