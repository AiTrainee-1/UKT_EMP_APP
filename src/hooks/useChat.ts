import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  CHAT_PAGE_SIZE,
  mergeMessages,
  oldestId,
  pageMayHaveMore,
  replaceMessage,
  toggleReactionLocal,
  isMyReaction,
} from '../lib/chatThread';

export interface ChatChannel {
  id: number;
  type: 'company' | 'department';
  departmentId?: number | null;
  departmentName?: string | null;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatReplyPreview {
  id: number;
  senderName: string;
  text: string;
}

export interface ChatMessage {
  id: number;
  /** null for a message written from the HR Portal (HR / management). */
  senderId: number | null;
  senderName: string;
  /** True for HR / management messages (sent by the server since the chat module shipped). */
  isHr?: boolean;
  text: string;
  replyTo: ChatReplyPreview | null;
  reactions: ChatReaction[];
  createdAt: string;
}

/**
 * Company channel + the employee's own department channel.
 * Errors are NOT turned into an empty list any more: a network failure must look like
 * "couldn't load, try again", not like "this chat does not exist".
 */
export function useChatChannels() {
  return useQuery({
    queryKey: ['chat-channels'],
    queryFn: async (): Promise<ChatChannel[]> => {
      const res = await api.get('/chat/channels');
      return Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    },
  });
}

function toList(data: unknown): ChatMessage[] {
  const items = Array.isArray(data) ? data : ((data as { items?: unknown })?.items ?? []);
  return Array.isArray(items) ? (items as ChatMessage[]) : [];
}

async function fetchMessages(channelId: number, params: { limit?: number; before?: number }): Promise<ChatMessage[]> {
  const res = await api.get(`/chat/channels/${channelId}/messages`, { params });
  return mergeMessages(toList(res.data));
}

const latestKey = (channelId: number | null) => ['chat-messages', channelId] as const;

interface OlderState {
  items: ChatMessage[];
  hasMore: boolean;
}

/**
 * One conversation: the newest page (polled every 4 s while `poll` is true), plus any older
 * pages the employee loaded by tapping "Load earlier messages".
 *
 * Why the poll keeps asking for "the latest 50" rather than only "after the newest id": the
 * server's `after=` answer contains only NEW messages, so a reaction someone adds to a message
 * already on screen would never show up. Re-reading the latest page every 4 s keeps reactions
 * live; the poll result is merged into what is already on the phone, so messages never vanish
 * from the top of the list when new ones push the window along.
 */
export function useChatThread(channelId: number | null, { poll }: { poll: boolean }) {
  const queryClient = useQueryClient();
  const [olderByChannel, setOlderByChannel] = useState<Record<number, OlderState>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);

  const latest = useQuery({
    queryKey: latestKey(channelId),
    queryFn: async (): Promise<ChatMessage[]> => {
      const fresh = await fetchMessages(channelId as number, { limit: CHAT_PAGE_SIZE });
      const previous = queryClient.getQueryData<ChatMessage[]>(latestKey(channelId));
      return mergeMessages(previous, fresh);
    },
    enabled: !!channelId,
    staleTime: 2_000,
    refetchInterval: poll ? 4_000 : false,
  });

  const older = channelId != null ? olderByChannel[channelId] : undefined;
  const messages = useMemo(() => mergeMessages(older?.items, latest.data), [older?.items, latest.data]);
  const hasOlder = older ? older.hasMore : pageMayHaveMore(latest.data?.length ?? 0);

  /** Loads the page before the oldest message on screen. Throws on failure (the screen shows a toast). */
  const loadOlder = useCallback(async () => {
    if (channelId == null || loadingOlder) return;
    const before = oldestId(messages);
    if (before == null) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages(channelId, { before, limit: CHAT_PAGE_SIZE });
      setOlderByChannel((m) => ({
        ...m,
        [channelId]: { items: mergeMessages(page, m[channelId]?.items), hasMore: pageMayHaveMore(page.length) },
      }));
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, loadingOlder, messages]);

  /** Puts a message the server returned (after sending or reacting) on screen straight away. */
  const applyServerMessage = useCallback(
    (msg: ChatMessage) => {
      if (channelId == null || !msg || typeof msg.id !== 'number') return;
      queryClient.setQueryData<ChatMessage[]>(latestKey(channelId), (old) =>
        old?.some((m) => m.id === msg.id) ? replaceMessage(old, msg) : mergeMessages(old, [msg]),
      );
      setOlderByChannel((m) => {
        const cur = m[channelId];
        if (!cur || !cur.items.some((x) => x.id === msg.id)) return m;
        return { ...m, [channelId]: { ...cur, items: replaceMessage(cur.items, msg) } };
      });
    },
    [channelId, queryClient],
  );

  const send = useMutation({
    mutationFn: async (data: { text: string; replyToId?: number }): Promise<ChatMessage | null> => {
      const res = await api.post(`/chat/channels/${channelId}/messages`, data);
      return (res.data as ChatMessage) ?? null;
    },
    onSuccess: (msg) => {
      if (msg && typeof msg.id === 'number') applyServerMessage(msg);
      else queryClient.invalidateQueries({ queryKey: latestKey(channelId) });
    },
  });

  /**
   * Adds or removes my reaction. The pill changes at once; if the server says no, it changes
   * back and the promise rejects so the screen can say so.
   */
  const react = useCallback(
    async (message: ChatMessage, emoji: string) => {
      const remove = isMyReaction(message, emoji);
      applyServerMessage(toggleReactionLocal(message, emoji, remove));
      try {
        const res = remove
          ? await api.delete(`/chat/messages/${message.id}/reactions`, { data: { emoji } })
          : await api.post(`/chat/messages/${message.id}/reactions`, { emoji });
        const updated = res?.data as ChatMessage | undefined;
        if (updated && typeof updated.id === 'number') applyServerMessage(updated);
      } catch (err) {
        applyServerMessage(message);
        throw err;
      }
    },
    [applyServerMessage],
  );

  return {
    messages,
    isLoading: latest.isLoading,
    isError: latest.isError,
    /** True when a background poll failed after messages had already loaded. */
    isStale: latest.isError && !!latest.data,
    refetch: latest.refetch,
    hasOlder,
    loadingOlder,
    loadOlder,
    send,
    react,
  };
}
