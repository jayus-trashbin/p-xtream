export const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👏", "💀", "🤯"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isValidReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}

export function sanitizeChatText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text
    .trim()
    // strip control characters except newline/tab
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  return trimmed;
}
