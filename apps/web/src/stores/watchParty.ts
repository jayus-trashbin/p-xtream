import { create } from "zustand";
import { persist } from "zustand/middleware";

import { usePlayerStore } from "@/stores/player/store";

export interface ChatMessage {
  msgId: string;
  clientMsgId?: string;
  userId: string;
  nickname?: string;
  text: string;
  ts: number;
  pending?: boolean;
}

export interface ReactionEvent {
  id: string;
  userId: string;
  emoji: string;
  ts: number;
}

export interface LobbyMember {
  userId: string;
  nickname?: string;
  ready: boolean;
  isHost: boolean;
}

export interface PresenceMember {
  userId: string;
  nickname?: string;
  isHost: boolean;
  joined: number;
}

interface WatchPartyStore {
  enabled: boolean;
  // 6-char alphanumeric code (matches backend nanoid format)
  roomCode: string | null;
  isHost: boolean;
  showStatusOverlay: boolean;
  // Transport mode
  transport: "ws" | "polling";
  wsConnected: boolean;
  // Chat
  showChat: boolean;
  chatMessages: ChatMessage[];
  unreadChatCount: number;
  // Reactions
  reactionsQueue: ReactionEvent[];
  // Lobby
  showLobby: boolean;
  lobbyMembers: LobbyMember[];
  lobbyReady: boolean;

  enableAsHost(): void;
  enableAsGuest(code: string): void;
  updateRoomCode(code: string): void;
  disable(): void;
  setShowStatusOverlay(show: boolean): void;
  setTransport(t: "ws" | "polling"): void;
  setWsConnected(c: boolean): void;
  toggleChat(): void;
  setShowLobby(s: boolean): void;
  setLobbyMembers(m: LobbyMember[]): void;
  setLobbyReady(r: boolean): void;
  appendMessage(m: ChatMessage): void;
  confirmMessage(clientMsgId: string, confirmed: ChatMessage): void;
  enqueueReaction(r: ReactionEvent): void;
  dequeueReaction(id: string): void;
  resetSession(): void;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Generate a 6-char alphanumeric code (matches backend format)
export const generateRoomCode = (): string => {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
};

// Helper function to reset playback rate to 1x
const resetPlaybackRate = () => {
  const display = usePlayerStore.getState().display;
  if (display) {
    display.setPlaybackRate(1);
  }
};

const MAX_CHAT_MESSAGES = 100;

export const useWatchPartyStore = create<WatchPartyStore>()(
  persist(
    (set, get) => ({
      enabled: false,
      roomCode: null,
      isHost: false,
      showStatusOverlay: false,
      transport: "ws",
      wsConnected: false,
      showChat: false,
      chatMessages: [],
      unreadChatCount: 0,
      reactionsQueue: [],
      showLobby: false,
      lobbyMembers: [],
      lobbyReady: false,

      enableAsHost: () => {
        resetPlaybackRate();
        set(() => ({
          enabled: true,
          roomCode: generateRoomCode(),
          isHost: true,
        }));
      },

      enableAsGuest: (code: string) => {
        resetPlaybackRate();
        set(() => ({
          enabled: true,
          roomCode: code,
          isHost: false,
        }));
      },

      updateRoomCode: (code: string) =>
        set((state) => ({ ...state, roomCode: code })),

      disable: () =>
        set(() => ({
          enabled: false,
          roomCode: null,
          wsConnected: false,
          showChat: false,
          chatMessages: [],
          unreadChatCount: 0,
          reactionsQueue: [],
          showLobby: false,
          lobbyMembers: [],
          lobbyReady: false,
        })),

      setShowStatusOverlay: (show: boolean) =>
        set(() => ({ showStatusOverlay: show })),

      setTransport: (t) => set(() => ({ transport: t })),

      setWsConnected: (c) => set(() => ({ wsConnected: c })),

      toggleChat: () => {
        const { showChat, unreadChatCount } = get();
        set(() => ({
          showChat: !showChat,
          unreadChatCount: !showChat ? 0 : unreadChatCount,
        }));
      },

      setShowLobby: (s) => set(() => ({ showLobby: s })),

      setLobbyMembers: (m) => set(() => ({ lobbyMembers: m })),

      setLobbyReady: (r) => set(() => ({ lobbyReady: r })),

      appendMessage: (m) =>
        set((state) => {
          const messages = [...state.chatMessages, m];
          const trimmed =
            messages.length > MAX_CHAT_MESSAGES
              ? messages.slice(messages.length - MAX_CHAT_MESSAGES)
              : messages;
          return {
            chatMessages: trimmed,
            unreadChatCount: state.showChat
              ? 0
              : state.unreadChatCount + (m.pending ? 0 : 1),
          };
        }),

      confirmMessage: (clientMsgId, confirmed) =>
        set((state) => ({
          chatMessages: state.chatMessages.map((m) =>
            m.clientMsgId === clientMsgId
              ? { ...confirmed, pending: false }
              : m,
          ),
        })),

      enqueueReaction: (r) =>
        set((state) => {
          const queue = [...state.reactionsQueue, r];
          return { reactionsQueue: queue.slice(-30) };
        }),

      dequeueReaction: (id) =>
        set((state) => ({
          reactionsQueue: state.reactionsQueue.filter((r) => r.id !== id),
        })),

      resetSession: () =>
        set(() => ({
          chatMessages: [],
          unreadChatCount: 0,
          reactionsQueue: [],
          showLobby: false,
          lobbyMembers: [],
          lobbyReady: false,
          wsConnected: false,
        })),
    }),
    {
      name: "watch-party-storage",
      // Only persist non-ephemeral state
      partialize: (state) => ({
        enabled: state.enabled,
        roomCode: state.roomCode,
        isHost: state.isHost,
        showStatusOverlay: state.showStatusOverlay,
        transport: state.transport,
      }),
    },
  ),
);
