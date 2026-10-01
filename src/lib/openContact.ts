import { Alert, Linking } from 'react-native';
import type { ContactAction, ContactActionKind } from './supportContact';

const FAILED: Record<ContactActionKind, { title: string; body: (value: string) => string }> = {
  call: {
    title: 'Could not start the call',
    body: (value) => `This phone could not open the dialer. Please dial ${value} yourself.`,
  },
  whatsapp: {
    title: 'Could not open WhatsApp',
    body: (value) => `WhatsApp could not be opened. Please message ${value} on WhatsApp yourself.`,
  },
  email: {
    title: 'Could not open your email',
    body: (value) => `No email app could be opened. Please write to ${value} from your email app.`,
  },
};

/**
 * Opens the phone / WhatsApp / email app for a contact. A phone with no dialer or no mail app
 * makes `openURL` reject; that becomes a friendly message with the number to use by hand rather
 * than an unhandled error. (An alert rather than the screen-level Toast, because these buttons
 * also live inside modals and sheets, where a toast drawn by the screen behind would not show.)
 */
export async function openContactAction(action: ContactAction): Promise<void> {
  if (!action.url) return;
  try {
    await Linking.openURL(action.url);
  } catch {
    const failed = FAILED[action.kind];
    Alert.alert(failed.title, failed.body(action.value));
  }
}
