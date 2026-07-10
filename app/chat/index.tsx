import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useChatChannels, useChatMessages, useSendChatMessage, useToggleReaction, ChatMessage } from '../../src/hooks/useChat';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function fmtTime(str: string) {
  try {
    return format(new Date(str), 'h:mm a');
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const { user } = useAuth();
  const { data: channels, isLoading: channelsLoading } = useChatChannels();
  const [channelType, setChannelType] = useState<'company' | 'department'>('company');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<ChatMessage | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'error', visible: false,
  });
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const swipeRefs = useRef<Record<number, Swipeable | null>>({});

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const companyChannel = channels?.find((c) => c.type === 'company');
  const deptChannel = channels?.find((c) => c.type === 'department');
  const activeChannel = channelType === 'company' ? companyChannel : deptChannel;

  const { data: messages, isLoading: messagesLoading } = useChatMessages(activeChannel?.id ?? null);
  const sendMessage = useSendChatMessage(activeChannel?.id ?? null);
  const toggleReaction = useToggleReaction(activeChannel?.id ?? null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!activeChannel) {
      showToast('This chat isn’t available yet. Please try again later.', 'error');
      return;
    }
    setText('');
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      await sendMessage.mutateAsync({ text: trimmed, replyToId });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } catch {
      setText(trimmed);
      setReplyTo(replyToId ? replyTo : null);
      showToast('Message failed to send. Please try again.', 'error');
    }
  };

  const handleReact = async (emoji: string) => {
    if (!reactingTo) return;
    const existing = reactingTo.reactions.find((r) => r.emoji === emoji && r.reactedByMe);
    setReactingTo(null);
    await toggleReaction.mutateAsync({ messageId: reactingTo.id, emoji, remove: !!existing });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Chat</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, channelType === 'company' && styles.tabBtnActive]}
          onPress={() => setChannelType('company')}
        >
          <MaterialCommunityIcons
            name="domain"
            size={14}
            color={channelType === 'company' ? '#fff' : Colors.textMuted}
          />
          <Text style={[styles.tabLabel, channelType === 'company' && styles.tabLabelActive]}>Company</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, channelType === 'department' && styles.tabBtnActive]}
          onPress={() => setChannelType('department')}
        >
          <MaterialCommunityIcons
            name="account-group"
            size={14}
            color={channelType === 'department' ? '#fff' : Colors.textMuted}
          />
          <Text style={[styles.tabLabel, channelType === 'department' && styles.tabLabelActive]} numberOfLines={1}>
            {deptChannel?.departmentName || 'Department'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {channelsLoading || messagesLoading ? (
          <View style={{ padding: 16 }}>
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </View>
        ) : !activeChannel ? (
          <EmptyState
            icon="chat-outline"
            title={channelType === 'department' ? 'No department chat yet' : 'Company chat unavailable'}
            subtitle={
              channelType === 'department'
                ? 'You may not have a department assigned, or this chat hasn’t been set up yet.'
                : 'This chat isn’t available right now. Please check back later.'
            }
          />
        ) : (
          <FlatList
            ref={listRef}
            data={messages ?? []}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <EmptyState icon="message-text-outline" title="No messages yet" subtitle="Start the conversation below" />
            }
            renderItem={({ item }) => {
              const isMine = item.senderId === user?.employeeId;
              return (
                <Swipeable
                  ref={(r) => { swipeRefs.current[item.id] = r; }}
                  renderLeftActions={() => (
                    <View style={styles.swipeReplyAction}>
                      <MaterialCommunityIcons name="reply" size={20} color={Colors.primary} />
                    </View>
                  )}
                  onSwipeableWillOpen={() => {
                    setReplyTo(item);
                    swipeRefs.current[item.id]?.close();
                  }}
                  overshootLeft={false}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onLongPress={() => setReactingTo(item)}
                    style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}
                  >
                    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[styles.senderName, isMine && styles.senderNameMine]}>{item.senderName}</Text>
                      {item.replyTo && (
                        <View style={[styles.replyPreview, isMine && styles.replyPreviewMine]}>
                          <Text style={[styles.replyPreviewSender, isMine && styles.replyPreviewTextMine]}>{item.replyTo.senderName}</Text>
                          <Text style={[styles.replyPreviewText, isMine && styles.replyPreviewTextMine]} numberOfLines={1}>
                            {item.replyTo.text}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{item.text}</Text>
                      <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>{fmtTime(item.createdAt)}</Text>
                    </View>
                    {item.reactions.length > 0 && (
                      <View style={[styles.reactionsRow, isMine && styles.reactionsRowMine]}>
                        {item.reactions.map((r) => (
                          <TouchableOpacity
                            key={r.emoji}
                            style={[styles.reactionPill, r.reactedByMe && styles.reactionPillActive]}
                            onPress={() => toggleReaction.mutate({ messageId: item.id, emoji: r.emoji, remove: r.reactedByMe })}
                          >
                            <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                            <Text style={[styles.reactionCount, r.reactedByMe && styles.reactionCountActive]}>{r.count}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                </Swipeable>
              );
            }}
          />
        )}

        {replyTo && (
          <View style={styles.replyBar}>
            <MaterialCommunityIcons name="reply" size={16} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarSender}>Replying to {replyTo.senderName}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyBarClose}>
              <MaterialCommunityIcons name="close" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.composer}>
          <TextInput
            style={[styles.composerInput, !activeChannel && styles.composerInputDisabled]}
            placeholder={activeChannel ? 'Type a message…' : 'Chat server not configured yet'}
            placeholderTextColor={Colors.outline}
            value={text}
            onChangeText={setText}
            editable={!!activeChannel}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || !activeChannel) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || !activeChannel || sendMessage.isPending}
          >
            <MaterialCommunityIcons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!reactingTo} transparent animationType="fade" onRequestClose={() => setReactingTo(null)}>
        <Pressable style={styles.emojiBackdrop} onPress={() => setReactingTo(null)}>
          <View style={styles.emojiPicker}>
            {EMOJIS.map((e) => (
              <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => handleReact(e)}>
                <Text style={styles.emojiBtnText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Toast {...toast} />
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#006496',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '800' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    margin: 12,
    borderRadius: BorderRadius.lg,
    padding: 4,
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    borderRadius: BorderRadius.md,
    paddingVertical: 9,
  },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },

  messageList: { padding: 12, paddingBottom: 8, gap: 4, flexGrow: 1 },

  msgRow: { marginBottom: 10, maxWidth: '82%' },
  msgRowMine: { alignSelf: 'flex-end' },
  msgRowTheirs: { alignSelf: 'flex-start' },

  bubble: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleTheirs: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderTopRightRadius: 4,
  },
  senderName: { color: Colors.primary, fontSize: 11, fontWeight: '800', marginBottom: 2 },
  senderNameMine: { color: 'rgba(255,255,255,0.85)' },
  msgText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 19 },
  msgTextMine: { color: '#fff' },
  msgTime: { color: Colors.textMuted, fontSize: 9, alignSelf: 'flex-end', marginTop: 2 },
  msgTimeMine: { color: 'rgba(255,255,255,0.7)' },

  replyPreview: {
    backgroundColor: Colors.bgSurfaceMid,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  replyPreviewMine: { backgroundColor: 'rgba(255,255,255,0.16)', borderLeftColor: '#fff' },
  replyPreviewSender: { color: Colors.primary, fontSize: 10, fontWeight: '700' },
  replyPreviewText: { color: Colors.textMuted, fontSize: 11 },
  replyPreviewTextMine: { color: 'rgba(255,255,255,0.85)' },

  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowMine: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  reactionPillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
  reactionEmoji: { fontSize: 11 },
  reactionCount: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  reactionCountActive: { color: Colors.primary },

  swipeReplyAction: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgCard,
    marginHorizontal: 12,
    borderRadius: BorderRadius.md,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  replyBarSender: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  replyBarText: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  replyBarClose: { padding: 4 },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
  },
  composerInput: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  composerInputDisabled: { opacity: 0.6 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },

  emojiBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiPicker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.full,
    padding: 8,
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  emojiBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnText: { fontSize: 22 },
});
