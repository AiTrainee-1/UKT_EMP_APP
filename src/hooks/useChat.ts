import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

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
  senderId: number;
  senderName: string;
  text: string;
  replyTo: ChatReplyPreview | null;
  reactions: ChatReaction[];
  createdAt: string;
}

export function useChatChannels() {
  return useQuery({
    queryKey: ['chat-channels'],
    queryFn: async (): Promise<ChatChannel[]> => {
      try {
        const res = await api.get('/chat/channels');
        return Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      } catch {
        return [];
      }
    },
  });
}

/** Polls while mounted; naturally stops once the conversation screen unmounts. */
export function useChatMessages(channelId: number | null) {
  return useQuery({
    queryKey: ['chat-messages', channelId],
    queryFn: async (): Promise<ChatMessage[]> => {
      const res = await api.get(`/chat/channels/${channelId}/messages`, { params: { limit: 50 } });
      const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      return [...items].sort((a: ChatMessage, b: ChatMessage) => a.id - b.id);
    },
    enabled: !!channelId,
    refetchInterval: 4000,
  });
}

export function useSendChatMessage(channelId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { text: string; replyToId?: number }) => {
      const res = await api.post(`/chat/channels/${channelId}/messages`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', channelId] });
    },
  });
}

export function useToggleReaction(channelId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji, remove }: { messageId: number; emoji: string; remove: boolean }) => {
      if (remove) {
        await api.delete(`/chat/messages/${messageId}/reactions`, { data: { emoji } });
      } else {
        await api.post(`/chat/messages/${messageId}/reactions`, { emoji });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', channelId] });
    },
  });
}
