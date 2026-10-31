/** The six reactions the chat offers, with the words a screen reader says for each. */
export const CHAT_EMOJIS: { emoji: string; name: string }[] = [
  { emoji: '👍', name: 'Thumbs up' },
  { emoji: '❤️', name: 'Heart' },
  { emoji: '😂', name: 'Laughing' },
  { emoji: '😮', name: 'Surprised' },
  { emoji: '😢', name: 'Sad' },
  { emoji: '🙏', name: 'Thank you' },
];

export function emojiName(emoji: string): string {
  return CHAT_EMOJIS.find((e) => e.emoji === emoji)?.name ?? emoji;
}
