import { useEffect, useRef } from "react";

import { useWatchPartySocket } from "@/hooks/useWatchPartySocket";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";

/**
 * Invisible component that manages the WebSocket connection for Watch Party.
 * When connected, the host sends player updates via WS instead of HTTP polling.
 */
export function WatchPartyProvider() {
  const { send } = useWatchPartySocket();

  const isHost = useWatchPartyStore((s) => s.isHost);
  const wsConnected = useWatchPartyStore((s) => s.wsConnected);
  const transport = useWatchPartyStore((s) => s.transport);
  const roomCode = useWatchPartyStore((s) => s.roomCode);
  const enabled = useWatchPartyStore((s) => s.enabled);

  const meta = usePlayerStore((s) => s.meta);
  const isPlaying = usePlayerStore((s) => s.mediaPlaying.isPlaying);
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  const currentTime = usePlayerStore((s) => s.progress.time);
  const duration = usePlayerStore((s) => s.progress.duration);
  const playbackRate = usePlayerStore((s) => s.mediaPlaying.playbackRate);
  const selectedSubtitleId = usePlayerStore((s) => s.caption.selected?.id);
  const dualSubtitleId = usePlayerStore((s) => s.caption.secondary?.id);

  const lastSentRef = useRef<string>("");
  const lastSentTimeRef = useRef<number>(0);

  // Debounced WS player update — only when host and WS connected
  useEffect(() => {
    if (!enabled || !isHost || !wsConnected || transport !== "ws" || !roomCode)
      return;
    if (!meta) return;

    const now = Date.now();
    const fingerprint = JSON.stringify({
      isPlaying,
      isPaused,
      time: Math.floor(currentTime),
      playbackRate,
      selectedSubtitleId,
      dualSubtitleId,
    });

    const hasChanged = fingerprint !== lastSentRef.current;
    const hostInterval = now - lastSentTimeRef.current >= 500;

    if (!hasChanged && !hostInterval) return;

    const userId = "host"; // transport carries auth via JWT
    send({
      type: "player:update",
      payload: {
        userId,
        roomCode,
        isHost: true,
        content: {
          title: meta.title,
          type: meta.type === "movie" ? "Movie" : "TV Show",
          tmdbId: meta.tmdbId ? Number(meta.tmdbId) : 0,
          seasonId: meta.season?.tmdbId ? Number(meta.season.tmdbId) : undefined,
          episodeId: meta.episode?.tmdbId
            ? Number(meta.episode.tmdbId)
            : undefined,
          seasonNumber: meta.season?.number,
          episodeNumber: meta.episode?.number,
        },
        player: {
          isPlaying,
          isPaused,
          isLoading: false,
          hasPlayedOnce: true,
          time: currentTime,
          duration,
          playbackRate,
          buffered: 0,
        },
        settings: {
          selectedSubtitleId,
          dualSubtitleId,
        },
        timestamp: now,
      },
    });

    lastSentRef.current = fingerprint;
    lastSentTimeRef.current = now;
  }, [
    enabled,
    isHost,
    wsConnected,
    transport,
    roomCode,
    meta,
    isPlaying,
    isPaused,
    currentTime,
    duration,
    playbackRate,
    selectedSubtitleId,
    dualSubtitleId,
    send,
  ]);

  return null;
}
