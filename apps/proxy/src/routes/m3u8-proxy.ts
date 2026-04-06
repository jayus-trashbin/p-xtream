import { LRUCache } from 'lru-cache';
import { setResponseHeaders } from 'h3';
import { getNextUserAgent } from '@/utils/userAgents';

// Check if caching is enabled via environment variable (disabled by default)
const isCacheDisabled = () => process.env.ENABLE_CACHE !== 'true';

function parseURL(req_url: string, baseUrl?: string) {
  if (baseUrl) {
    return new URL(req_url, baseUrl).href;
  }
  
  const match = req_url.match(/^(?:(https?:)?\/\/)?(([^/?]+?)(?::(\d{0,5})(?=[/?]|$))?)([/?][\S\s]*|$)/i);
  
  if (!match) {
    return null;
  }
  
  if (!match[1]) {
    if (/^https?:/i.test(req_url)) {
      return null;
    }
    
    if (req_url.lastIndexOf("//", 0) === -1) {
      req_url = "//" + req_url;
    }
    req_url = (match[4] === "443" ? "https:" : "http:") + req_url;
  }
  
  try {
    const parsed = new URL(req_url);
    if (!parsed.hostname) {
      return null;
    }
    return parsed.href;
  } catch (error) {
    return null;
  }
}

// ── LRU Cache (TASK-038) ──────────────────────────────────────────────────────
// Memory-bounded: evicts least-recently-used when RAM limit is hit.
// No more manual cleanup intervals or O(n) sort evictions.

interface CacheEntry {
  data: Uint8Array;
  headers: Record<string, string>;
}

const CACHE_MAX_MEMORY_BYTES =
  parseInt(process.env.CACHE_MAX_MEMORY_MB ?? '512', 10) * 1024 * 1024;

const segmentCache = new LRUCache<string, CacheEntry>({
  maxSize: CACHE_MAX_MEMORY_BYTES,
  // size = actual byte length of the cached segment
  sizeCalculation: (entry) => entry.data.byteLength,
  ttl: 2 * 60 * 60 * 1000, // 2 hours (same as before)
  allowStale: false,
});

async function prefetchSegment(url: string, headers: HeadersInit) {
  if (isCacheDisabled()) return;
  if (segmentCache.has(url)) return;

  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getNextUserAgent(),
        ...(headers as HeadersInit),
      },
    });

    if (!response.ok) {
      console.error(`Failed to prefetch TS segment: ${response.status} ${response.statusText}`);
      return;
    }

    const data = new Uint8Array(await response.arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    segmentCache.set(url, { data, headers: responseHeaders });
  } catch (error) {
    console.error(`Error prefetching segment ${url}:`, error);
  }
}

export function getCachedSegment(url: string): CacheEntry | undefined {
  if (isCacheDisabled()) return undefined;
  return segmentCache.get(url);
}

export function getCacheStats() {
  return {
    entries: segmentCache.size,
    calculatedSizeBytes: segmentCache.calculatedSize,
    calculatedSizeMB: (segmentCache.calculatedSize / (1024 * 1024)).toFixed(2),
    maxSizeBytes: CACHE_MAX_MEMORY_BYTES,
    maxSizeMB: (CACHE_MAX_MEMORY_BYTES / (1024 * 1024)).toFixed(0),
    fillPercent: ((segmentCache.calculatedSize / CACHE_MAX_MEMORY_BYTES) * 100).toFixed(1),
    ttlMs: 2 * 60 * 60 * 1000,
  };
}

/**
 * Proxies m3u8 files and replaces the content to point to the proxy
 */
async function proxyM3U8(event: any) {
  const url = getQuery(event).url as string;
  const headersParam = getQuery(event).headers as string;
  
  if (!url) {
    return sendError(event, createError({
      statusCode: 400,
      statusMessage: 'URL parameter is required'
    }));
  }
  
  let headers = {};
  try {
    headers = headersParam ? JSON.parse(headersParam) : {};
  } catch (e) {
    return sendError(event, createError({
      statusCode: 400,
      statusMessage: 'Invalid headers format'
    }));
  }
  
  try {
    const response = await globalThis.fetch(url, {
      headers: {
        'User-Agent': getNextUserAgent(),
        ...(headers as HeadersInit),
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Failed to fetch M3U8: ${response.status} ${response.statusText} for URL: ${url}`);
      console.error(`Response body: ${errorText}`);
      throw new Error(`Failed to fetch M3U8: ${response.status} ${response.statusText}`);
    }
    
    const m3u8Content = await response.text();
    
    const host = getRequestHost(event);
    const proto = getRequestProtocol(event);
    const baseProxyUrl = `${proto}://${host}`;
    
    if (m3u8Content.includes("RESOLUTION=")) {
      // Master playlist — multiple quality variants
      const lines = m3u8Content.split("\n");
      const newLines: string[] = [];
      
      for (const line of lines) {
        if (line.startsWith("#")) {
          if (line.startsWith("#EXT-X-KEY:")) {
            const regex = /https?:\/\/[^\""\s]+/g;
            const keyUrl = regex.exec(line)?.[0];
            if (keyUrl) {
              const proxyKeyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
              newLines.push(line.replace(keyUrl, proxyKeyUrl));
            } else {
              newLines.push(line);
            }
          } else if (line.startsWith("#EXT-X-MEDIA:")) {
            const regex = /https?:\/\/[^\""\s]+/g;
            const mediaUrl = regex.exec(line)?.[0];
            if (mediaUrl) {
              const proxyMediaUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(mediaUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
              newLines.push(line.replace(mediaUrl, proxyMediaUrl));
            } else {
              newLines.push(line);
            }
          } else {
            newLines.push(line);
          }
        } else if (line.trim()) {
          const variantUrl = parseURL(line, url);
          if (variantUrl) {
            newLines.push(`${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(variantUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`);
          } else {
            newLines.push(line);
          }
        } else {
          newLines.push(line);
        }
      }
      
      setResponseHeaders(event, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      
      return newLines.join("\n");
    } else {
      // Media playlist — individual segments
      const lines = m3u8Content.split("\n");
      const newLines: string[] = [];
      const segmentUrls: string[] = [];
      
      for (const line of lines) {
        if (line.startsWith("#")) {
          if (line.startsWith("#EXT-X-KEY:")) {
            const regex = /https?:\/\/[^\""\s]+/g;
            const keyUrl = regex.exec(line)?.[0];
            if (keyUrl) {
              const proxyKeyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
              newLines.push(line.replace(keyUrl, proxyKeyUrl));
              if (!isCacheDisabled()) prefetchSegment(keyUrl, headers as HeadersInit);
            } else {
              newLines.push(line);
            }
          } else {
            newLines.push(line);
          }
        } else if (line.trim() && !line.startsWith("#")) {
          const segmentUrl = parseURL(line, url);
          if (segmentUrl) {
            segmentUrls.push(segmentUrl);
            newLines.push(`${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(segmentUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`);
          } else {
            newLines.push(line);
          }
        } else {
          newLines.push(line);
        }
      }
      
      if (segmentUrls.length > 0 && !isCacheDisabled()) {
        Promise.all(segmentUrls.map((segmentUrl) =>
          prefetchSegment(segmentUrl, headers as HeadersInit)
        )).catch((error) => {
          console.error('Error prefetching segments:', error);
        });
      }
      
      setResponseHeaders(event, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      
      return newLines.join("\n");
    }
  } catch (error: any) {
    console.error('Error proxying M3U8:', error);
    return sendError(event, createError({
      statusCode: 500,
      statusMessage: error.message || 'Error proxying M3U8 file'
    }));
  }
}

export function handleCacheStats(event: any) {
  setResponseHeaders(event, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  return getCacheStats();
}

export default defineEventHandler(async (event) => {
  if (isPreflightRequest(event)) return handleCors(event, {});

  if (process.env.DISABLE_M3U8 === 'true') {
    return sendError(event, createError({
      statusCode: 404,
      statusMessage: 'M3U8 proxying is disabled'
    }));
  }
  
  if (event.path === '/cache-stats') {
    return handleCacheStats(event);
  }
  
  return await proxyM3U8(event);
});
