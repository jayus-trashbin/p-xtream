import { detect } from "detect-browser";

import { usePlayerStore } from "@/stores/player/store";

export interface ErrorDebugInfo {
  timestamp: string;
  error: {
    message: string;
    type: string;
    stackTrace?: string;
  };
  device: {
    userAgent: string;
    browser: string;
    os: string;
    isMobile: boolean;
    isTV: boolean;
    screenResolution: string;
    viewportSize: string;
  };
  player: {
    status: string;
    sourceId: string | null;
    embedId: string | null;
    currentQuality: string | null;
    meta: {
      title: string;
      type: string;
      tmdbId: string;
      imdbId?: string;
      releaseYear: number;
      season?: number;
      episode?: number;
    } | null;
  };
  network: {
    online: boolean;
    connectionType?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
  hls?: {
    details: string;
    fatal: boolean;
    level?: number;
    levelDetails?: {
      url: string;
      width: number;
      height: number;
      bitrate: number;
    };
    frag?: {
      url: string;
      baseurl: string;
      duration: number;
      start: number;
      sn: number;
    };
    type: string;
    url?: string;
  };
  url: {
    pathname: string;
    search: string;
    hash: string;
  };

  performance: {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
    timing: {
      navigationStart: number;
      loadEventEnd: number;
      domContentLoadedEventEnd: number;
    };
  };
}

export function gatherErrorDebugInfo(error: any): ErrorDebugInfo {
  const browserInfo = detect();
  const isMobile = window.innerWidth <= 768;
  const isTV =
    /SmartTV|Tizen|WebOS|SamsungBrowser|HbbTV|Viera|NetCast|AppleTV|Android TV|GoogleTV|Roku|PlayStation|Xbox|Opera TV|AquosBrowser|Hisense|SonyBrowser|SharpBrowser|AFT|Chromecast/i.test(
      navigator.userAgent,
    );

  const playerStore = usePlayerStore.getState();

  // Get network information
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  // Get performance information
  const performanceInfo = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming;
  const memory = (performance as any).memory;

  return {
    timestamp: new Date().toISOString(),
    error: {
      message: error?.message || error?.key || String(error),
      type: error?.type || "unknown",
      stackTrace: error?.stackTrace || error?.stack,
    },
    device: {
      userAgent: navigator.userAgent,
      browser: browserInfo?.name || "unknown",
      os: browserInfo?.os || "unknown",
      isMobile,
      isTV,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    },
    player: {
      status: playerStore.status,
      sourceId: playerStore.sourceId,
      embedId: (playerStore as any).embedId ?? null,
      currentQuality: playerStore.currentQuality,
      meta: playerStore.meta
        ? {
            title: playerStore.meta.title,
            type: playerStore.meta.type as string,
            tmdbId: playerStore.meta.tmdbId,
            ...(playerStore.meta.imdbId ? { imdbId: playerStore.meta.imdbId } : {}),
            releaseYear: playerStore.meta.releaseYear,
            ...(playerStore.meta.season?.number !== undefined ? { season: playerStore.meta.season.number } : {}),
            ...(playerStore.meta.episode?.number !== undefined ? { episode: playerStore.meta.episode.number } : {}),
          }
        : null,
    },
    network: {
      online: navigator.onLine,
      connectionType: connection?.type,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
    },
    ...(error?.hls
      ? {
          hls: {
            details: error.hls.details as string,
            fatal: error.hls.fatal as boolean,
            ...(error.hls.level !== undefined ? { level: error.hls.level as number } : {}),
            ...(error.hls.levelDetails
              ? {
                  levelDetails: {
                    url: error.hls.levelDetails.url as string,
                    width: error.hls.levelDetails.width as number,
                    height: error.hls.levelDetails.height as number,
                    bitrate: error.hls.levelDetails.bitrate as number,
                  },
                }
              : {}),
            ...(error.hls.frag
              ? {
                  frag: {
                    url: error.hls.frag.url as string,
                    baseurl: error.hls.frag.baseurl as string,
                    duration: error.hls.frag.duration as number,
                    start: error.hls.frag.start as number,
                    sn: error.hls.frag.sn as number,
                  },
                }
              : {}),
            type: error.hls.type as string,
            ...(error.hls.url !== undefined ? { url: error.hls.url as string } : {}),
          },
        }
      : {}),
    url: {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    },
    performance: {
      ...(memory
        ? {
            memory: {
              usedJSHeapSize: memory.usedJSHeapSize,
              totalJSHeapSize: memory.totalJSHeapSize,
              jsHeapSizeLimit: memory.jsHeapSizeLimit,
            },
          }
        : {}),
      timing: {
        navigationStart: performanceInfo?.fetchStart || 0,
        loadEventEnd: performanceInfo?.loadEventEnd || 0,
        domContentLoadedEventEnd:
          performanceInfo?.domContentLoadedEventEnd || 0,
      },
    },
  };
}

export function formatErrorDebugInfo(info: ErrorDebugInfo): string {
  const sections = [
    `=== ERROR DEBUG INFO ===`,
    `Timestamp: ${info.timestamp}`,
    ``,
    `=== ERROR DETAILS ===`,
    `Type: ${info.error.type}`,
    `Message: ${info.error.message}`,
    info.error.stackTrace ? `Stack Trace:\n${info.error.stackTrace}` : "",
    ``,
    `=== DEVICE INFO ===`,
    `Browser: ${info.device.browser} (${info.device.os})`,
    `User Agent: ${info.device.userAgent}`,
    `Screen: ${info.device.screenResolution}`,
    `Viewport: ${info.device.viewportSize}`,
    `Mobile: ${info.device.isMobile}`,
    `TV: ${info.device.isTV}`,
    ``,
    `=== PLAYER STATE ===`,
    `Status: ${info.player.status}`,
    `Source ID: ${info.player.sourceId || "null"}`,
    `Embed ID: ${info.player.embedId || "null"}`,
    `Quality: ${info.player.currentQuality || "null"}`,
    info.player.meta
      ? [
          `Media: ${info.player.meta.title} (${info.player.meta.type})`,
          `TMDB ID: ${info.player.meta.tmdbId}`,
          info.player.meta.imdbId ? `IMDB ID: ${info.player.meta.imdbId}` : "",
          `Year: ${info.player.meta.releaseYear}`,
          info.player.meta.season ? `Season: ${info.player.meta.season}` : "",
          info.player.meta.episode
            ? `Episode: ${info.player.meta.episode}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No media loaded",
    ``,
    `=== NETWORK INFO ===`,
    `Online: ${info.network.online}`,
    info.network.connectionType
      ? `Connection Type: ${info.network.connectionType}`
      : "",
    info.network.effectiveType
      ? `Effective Type: ${info.network.effectiveType}`
      : "",
    info.network.downlink ? `Downlink: ${info.network.downlink} Mbps` : "",
    info.network.rtt ? `RTT: ${info.network.rtt} ms` : "",
    ``,
    `=== URL INFO ===`,
    `Path: ${info.url.pathname}`,
    info.url.search ? `Query: ${info.url.search}` : "",
    info.url.hash ? `Hash: ${info.url.hash}` : "",
    ``,
    info.hls
      ? [
          `=== HLS ERROR DETAILS ===`,
          `Details: ${info.hls.details}`,
          `Fatal: ${info.hls.fatal}`,
          `Type: ${info.hls.type}`,
          info.hls.level !== undefined ? `Level: ${info.hls.level}` : "",
          info.hls.url ? `URL: ${info.hls.url}` : "",
          info.hls.levelDetails
            ? [
                `Level Details:`,
                `  URL: ${info.hls.levelDetails.url}`,
                `  Resolution: ${info.hls.levelDetails.width}x${info.hls.levelDetails.height}`,
                `  Bitrate: ${info.hls.levelDetails.bitrate} bps`,
              ].join("\n")
            : "",
          info.hls.frag
            ? [
                `Fragment Details:`,
                `  URL: ${info.hls.frag.url}`,
                `  Base URL: ${info.hls.frag.baseurl}`,
                `  Duration: ${info.hls.frag.duration}s`,
                `  Start: ${info.hls.frag.start}s`,
                `  Sequence: ${info.hls.frag.sn}`,
              ].join("\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    ``,
    `=== PERFORMANCE ===`,
    info.performance.memory
      ? [
          `Memory Used: ${Math.round(info.performance.memory.usedJSHeapSize / 1024 / 1024)} MB`,
          `Memory Total: ${Math.round(info.performance.memory.totalJSHeapSize / 1024 / 1024)} MB`,
          `Memory Limit: ${Math.round(info.performance.memory.jsHeapSizeLimit / 1024 / 1024)} MB`,
        ].join("\n")
      : "Memory info not available",
  ];

  return sections.filter(Boolean).join("\n");
}
