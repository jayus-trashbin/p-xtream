/* eslint-disable no-console */
import { useCallback, useEffect, useRef } from "react";

import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import {
  ChatMessage,
  LobbyMember,
  ReactionEvent,
  useWatchPartyStore,
} from "@/stores/watchParty";

const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_MISSED_PONGS = 2;
const BACKOFF_CAPS = [1000, 2000, 4000, 8000, 15000] as const;

function getBackoff(attempt: number): number {
  return BACKOFF_CAPS[Math.min(attempt, BACKOFF_CAPS.length - 1)];
}

function toWsUrl(httpUrl: string, roomCode: string, token: string): string {
  const base = httpUrl.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/watch-party/${roomCode}?token=${encodeURIComponent(token)}`;
}

export function useWatchPartySocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const missedPongsRef = useRef(0);
  const mountedRef = useRef(true);

  const backendUrl = useBackendUrl();
  const account = useAuthStore((s) => s.account);

  const {
    enabled,
    roomCode,
    transport,
    appendMessage,
    confirmMessage,
    enqueueReaction,
    setLobbyMembers,
    setShowLobby,
    setWsConnected,
    setTransport,
    resetSession,
  } = useWatchPartyStore();

  const send = useCallback(
    (event: Record<string, unknown>): boolean => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
        return false;
      try {
        socketRef.current.send(JSON.stringify(event));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    missedPongsRef.current = 0;
    heartbeatTimerRef.current = setInterval(() => {
      missedPongsRef.current += 1;
      if (missedPongsRef.current > MAX_MISSED_PONGS) {
        console.warn("[WatchParty WS] Too many missed pongs — reconnecting");
        socketRef.current?.close();
        return;
      }
      send({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }, [send, stopHeartbeat]);

  const handleMessage = useCallback(
    (raw: string) => {
      let event: { type: string; payload?: unknown; from?: string; userId?: string };
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }

      const store = useWatchPartyStore.getState();

      switch (event.type) {
        case "pong": {
          missedPongsRef.current = 0;
          reconnectAttemptRef.current = 0;
          break;
        }

        case "chat:message": {
          const pl = event.payload as ChatMessage & { clientMsgId?: string };
          if (pl.clientMsgId) {
            confirmMessage(pl.clientMsgId, pl);
          } else {
            appendMessage({ ...pl, pending: false });
          }
          break;
        }

        case "reaction": {
          const pl = event.payload as { userId: string; emoji: string; ts: number };
          const reaction: ReactionEvent = {
            id: `${pl.userId}-${pl.ts}-${Math.random()}`,
            userId: pl.userId,
            emoji: pl.emoji,
            ts: pl.ts,
          };
          enqueueReaction(reaction);
          break;
        }

        case "lobby:state": {
          const pl = event.payload as {
            members: LobbyMember[];
            started: boolean;
          };
          if (pl.started) {
            setShowLobby(false);
          } else {
            setLobbyMembers(pl.members);
            setShowLobby(true);
          }
          break;
        }

        case "presence:snapshot": {
          // Store last player status for sync purposes
          // Snapshot is consumed by WatchPartySync via store
          break;
        }

        case "user:joined":
        case "user:left": {
          // Presence updates handled by WatchPartyStatus component via polling fallback
          break;
        }

        case "player:update": {
          const pl = event.payload as any;
          const from = event.from;
          if (from && pl) {
            store.setWsConnected(true);
          }
          break;
        }

        case "system:rate-limited": {
          const pl = event.payload as { kind: string; retryAfterMs: number };
          console.warn(
            `[WatchParty] Rate limited on ${pl.kind} for ${pl.retryAfterMs}ms`,
          );
          break;
        }

        case "host:transfer": {
          const pl = event.payload as { newHostId: string };
          const myId = account?.userId;
          if (myId && pl.newHostId === myId) {
            useWatchPartyStore.setState({ isHost: true });
          }
          break;
        }

        default:
          break;
      }
    },
    [
      account?.userId,
      appendMessage,
      confirmMessage,
      enqueueReaction,
      setLobbyMembers,
      setShowLobby,
    ],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled || !roomCode) return;
    if (!backendUrl || !account?.token) {
      setTransport("polling");
      return;
    }

    const url = toWsUrl(backendUrl, roomCode, account.token);
    console.log("[WatchParty WS] Connecting…", url);

    const ws = new WebSocket(url);
    socketRef.current = ws;

    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn("[WatchParty WS] Connection timed out");
        ws.close();
      }
    }, 5000);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      if (!mountedRef.current) return;
      console.log("[WatchParty WS] Connected");
      reconnectAttemptRef.current = 0;
      setWsConnected(true);
      setTransport("ws");
      startHeartbeat();
      ws.send(JSON.stringify({ type: "presence:hello" }));
    };

    ws.onmessage = (e) => handleMessage(e.data as string);

    ws.onerror = (e) => {
      console.error("[WatchParty WS] Error", e);
    };

    ws.onclose = () => {
      clearTimeout(connectTimeout);
      stopHeartbeat();
      if (!mountedRef.current) return;

      setWsConnected(false);
      setTransport("polling");

      reconnectAttemptRef.current += 1;
      const delay = getBackoff(reconnectAttemptRef.current - 1);
      console.log(
        `[WatchParty WS] Closed. Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`,
      );
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [
    enabled,
    roomCode,
    backendUrl,
    account?.token,
    handleMessage,
    setTransport,
    setWsConnected,
    startHeartbeat,
    stopHeartbeat,
  ]);

  // Connect/disconnect on enabled+roomCode change
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && roomCode && transport !== "polling") {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      stopHeartbeat();
      if (socketRef.current) {
        socketRef.current.onclose = null; // prevent reconnect on unmount close
        socketRef.current.close();
        socketRef.current = null;
      }
      setWsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomCode]);

  return { send };
}
