import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { openContactAction } from '../lib/openContact';
import {
  contactFor,
  fallbackSentence,
  normalizeSupportContact,
  primaryContactAction,
  readCachedSupportContact,
  writeCachedSupportContact,
  type ContactAction,
  type ContactBlock,
  type ContactSituation,
  type SupportContact,
} from '../lib/supportContact';

export const SUPPORT_CONTACT_QUERY_KEY = ['support-contact'] as const;

const STALE_MS = 5 * 60 * 1000;

/**
 * Asks the server for the HR / software-support details HR has configured. The endpoint is public:
 * `isPublic` keeps the sign-in token off the request and stops a 401 from ever signing anyone out.
 *
 * A reply that does not match the contract is an error, not data - so it can neither replace what is
 * on screen nor be written to the saved copy.
 */
async function fetchSupportContact(): Promise<SupportContact> {
  const res = await api.get('/support-contact', { isPublic: true, timeout: 10000 });
  const data = normalizeSupportContact(res.data);
  if (!data) throw new Error('Unexpected reply from /support-contact');
  // Every good reply becomes the copy that is still there when the server is not.
  void writeCachedSupportContact(data);
  return data;
}

/**
 * Puts the copy saved on the phone into the query cache, unless something newer is already there.
 * The cached copy is stamped as old, so a fresh one is still fetched, and because it lives in the
 * query cache it stays on screen when that fetch fails (react-query keeps `data` through an error).
 * Safe to call again: the cache is emptied on sign-out and needs filling again on the login screen.
 */
export async function hydrateSupportContact(queryClient: QueryClient): Promise<void> {
  if (queryClient.getQueryData(SUPPORT_CONTACT_QUERY_KEY)) return;
  const cached = await readCachedSupportContact();
  if (cached && !queryClient.getQueryData(SUPPORT_CONTACT_QUERY_KEY)) {
    queryClient.setQueryData(SUPPORT_CONTACT_QUERY_KEY, cached, { updatedAt: 0 });
  }
}

/**
 * App start (app/_layout.tsx): fill from the saved copy, then refresh from the server. Never throws:
 * a first launch with the server working caches the details, and one without it changes nothing.
 */
export async function prefetchSupportContact(queryClient: QueryClient): Promise<void> {
  await hydrateSupportContact(queryClient);
  await queryClient.prefetchQuery({
    queryKey: SUPPORT_CONTACT_QUERY_KEY,
    queryFn: fetchSupportContact,
    staleTime: STALE_MS,
    retry: false,
  });
}

/**
 * The HR / software-support contact details: the saved copy straight away, refreshed in the background.
 * `contact` is null only until something has ever been loaded (first launch, server unreachable) -
 * screens then fall back to plain wording with no numbers.
 */
export function useSupportContact() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SUPPORT_CONTACT_QUERY_KEY,
    queryFn: fetchSupportContact,
    retry: false,
    staleTime: STALE_MS,
  });

  useEffect(() => {
    hydrateSupportContact(queryClient).catch(() => {});
  }, [queryClient]);

  return {
    contact: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

/**
 * For places with room for a single link ("Need help? Call HR ..."): the one action to offer for a
 * situation, what to say when there is none, and a tap handler that copes with a phone that cannot
 * place the call.
 */
export function useSupportAction(situation: ContactSituation): {
  block: ContactBlock | null;
  action: ContactAction | null;
  fallback: string;
  open: () => void;
} {
  const { contact } = useSupportContact();
  const block = contactFor(contact, situation);
  const action = primaryContactAction(block);
  const open = useCallback(() => {
    if (action) void openContactAction(action);
  }, [action]);
  return { block, action, fallback: fallbackSentence(situation), open };
}
