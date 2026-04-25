import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useWatchPartySocket } from "@/hooks/useWatchPartySocket";
import { useAuthStore } from "@/stores/auth";
import { useWatchPartyStore } from "@/stores/watchParty";

const EMOJIS = ["🔥", "😂", "🤯", "❤️", "😭", "👀"];
const MAX_LENGTH = 500;

function ChatBubble({
  text,
  nickname,
  isOwn,
  pending,
}: {
  text: string;
  nickname?: string;
  isOwn: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}
    >
      {nickname && !isOwn && (
        <span className="text-xs text-type-secondary px-1">{nickname}</span>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-snug break-words ${
          isOwn
            ? `bg-[#9D4EDD] text-white ${pending ? "opacity-60" : ""}`
            : "bg-video-context-buttons-list text-white"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

export function WatchPartyChat() {
  const { t } = useTranslation();
  const { send } = useWatchPartySocket();
  const account = useAuthStore((s) => s.account);

  const showChat = useWatchPartyStore((s) => s.showChat);
  const chatMessages = useWatchPartyStore((s) => s.chatMessages);
  const unreadChatCount = useWatchPartyStore((s) => s.unreadChatCount);
  const appendMessage = useWatchPartyStore((s) => s.appendMessage);
  const toggleChat = useWatchPartyStore((s) => s.toggleChat);

  const [text, setText] = useState("");
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (showChat) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length, showChat]);

  // Focus input when chat opens
  useEffect(() => {
    if (showChat) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showChat]);

  const sendMessage = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_LENGTH) return;
    if (Date.now() < rateLimitedUntil) return;

    const clientMsgId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    appendMessage({
      msgId: clientMsgId,
      clientMsgId,
      userId: account?.userId ?? "guest",
      text: trimmed,
      ts: Date.now(),
      pending: true,
    });

    const sent = send({
      type: "chat:message",
      payload: { text: trimmed, clientMsgId },
    });

    if (!sent) {
      // WS not available — still show as sent locally (graceful degradation)
    }

    setText("");
  }, [text, rateLimitedUntil, appendMessage, account?.userId, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      if (Date.now() < rateLimitedUntil) return;
      const sent = send({
        type: "reaction",
        payload: { emoji },
      });
      if (sent) {
        // Enqueue locally for immediate feedback
        useWatchPartyStore.getState().enqueueReaction({
          id: `local-${Date.now()}`,
          userId: account?.userId ?? "guest",
          emoji,
          ts: Date.now(),
        });
      }
    },
    [send, rateLimitedUntil, account?.userId],
  );

  if (!showChat) return null;

  const isRateLimited = Date.now() < rateLimitedUntil;
  const myUserId = account?.userId ?? "guest";

  return (
    <div
      className="absolute right-0 top-0 h-full w-72 z-[55] flex flex-col bg-black/80 backdrop-blur-sm border-l border-white/10"
      role="dialog"
      aria-label={t("watchParty.chat.title", "Chat da sala")}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-sm font-semibold text-white">
          {t("watchParty.chat.title", "Chat")}
        </span>
        <button
          type="button"
          onClick={toggleChat}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-type-secondary hover:text-white transition-colors"
          aria-label={t("watchParty.chat.close", "Fechar chat")}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2"
        role="log"
        aria-live="polite"
        aria-label={t("watchParty.chat.messages", "Mensagens")}
      >
        {chatMessages.length === 0 && (
          <p className="text-type-secondary text-xs text-center mt-4">
            {t("watchParty.chat.empty", "Nenhuma mensagem ainda.")}
          </p>
        )}
        {chatMessages.map((m) => (
          <ChatBubble
            key={m.msgId}
            text={m.text}
            nickname={m.nickname}
            isOwn={m.userId === myUserId}
            pending={m.pending}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input & Reactions */}
      <div className="px-3 py-2 border-t border-white/10 flex flex-col gap-2">
        <div className="flex gap-2 items-center justify-between px-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => sendReaction(emoji)}
              disabled={isRateLimited}
              className="text-lg hover:scale-125 transition-transform disabled:opacity-50"
              title={t("watchParty.chat.react", "Reagir com {{emoji}}", { emoji })}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              isRateLimited
                ? t("watchParty.chat.rateLimited", "Aguarde…")
                : t("watchParty.chat.placeholder", "Mensagem…")
            }
            disabled={isRateLimited}
            className="w-full bg-white/10 text-white text-sm rounded-xl px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[#9D4EDD] placeholder:text-white/40 disabled:opacity-50 min-h-[44px]"
            style={{ fieldSizing: "content" } as React.CSSProperties}
            aria-label={t("watchParty.chat.inputLabel", "Digite uma mensagem")}
          />
          <span className="absolute bottom-1 right-2 text-[10px] text-white/30">
            {text.length}/{MAX_LENGTH}
          </span>
        </div>
        <button
          type="button"
          onClick={sendMessage}
          disabled={!text.trim() || isRateLimited}
          className="w-11 h-11 rounded-xl bg-[#9D4EDD] disabled:opacity-40 flex items-center justify-center text-white hover:bg-[#7B2FBE] transition-colors flex-shrink-0"
          aria-label={t("watchParty.chat.send", "Enviar")}
        >
          ➤
        </button>
        </div>
      </div>
    </div>
  );
}

export function ChatToggleButton() {
  const { t } = useTranslation();
  const toggleChat = useWatchPartyStore((s) => s.toggleChat);
  const unreadChatCount = useWatchPartyStore((s) => s.unreadChatCount);
  const showChat = useWatchPartyStore((s) => s.showChat);

  return (
    <button
      type="button"
      onClick={toggleChat}
      className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
      aria-label={
        showChat
          ? t("watchParty.chat.hide", "Ocultar chat")
          : t("watchParty.chat.show", "Mostrar chat")
      }
    >
      💬
      {unreadChatCount > 0 && !showChat && (
        <span className="absolute top-0 right-0 bg-[#9D4EDD] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {unreadChatCount > 9 ? "9+" : unreadChatCount}
        </span>
      )}
    </button>
  );
}
