// P-Stream Userscript — TypeScript source
// Compiled with esbuild → dist/p-stream.user.js
// Do NOT edit the compiled file directly.

// ─── Types ───────────────────────────────────────────────────────────────────

interface StreamRule {
  id: string;
  targetDomains?: string[];
  targetRegex?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

interface BlobMetadata {
  element: HTMLMediaElement | null;
  originalUrl: string;
  createdAt: number;
  size: number;
}

type BodyType = 'FormData' | 'URLSearchParams' | 'object' | 'string' | 'binary';

interface GmRequestOptions {
  url: string;
  method: string;
  data?: unknown;
  headers?: Record<string, string>;
  responseType?: 'arraybuffer' | 'text' | 'blob' | 'json';
  withCredentials?: boolean;
}

interface GmResponse {
  status: number;
  statusText?: string;
  responseHeaders: string;
  response: unknown;
  responseText?: string;
  finalUrl?: string;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const SCRIPT_VERSION = '1.4.0';

// Use unsafeWindow when available so our patches run in the page context.
const pageWindow: Window =
  typeof unsafeWindow !== 'undefined' ? (unsafeWindow as Window & typeof globalThis) : window;

const gmXhr: ((opts: GmRequestOptions & { onload: (r: GmResponse) => void; onerror: (e: unknown) => void; ontimeout: () => void }) => void) | null =
  typeof GM_xmlhttpRequest === 'function'
    ? GM_xmlhttpRequest
    : typeof GM !== 'undefined' && typeof (GM as { xmlHttpRequest?: unknown }).xmlHttpRequest === 'function'
    ? (GM as { xmlHttpRequest: typeof GM_xmlhttpRequest }).xmlHttpRequest
    : null;

// ─── Constants & State ───────────────────────────────────────────────────────

const DEFAULT_CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'access-control-allow-headers': '*',
};

const MODIFIABLE_RESPONSE_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'content-security-policy',
  'content-security-policy-report-only',
  'content-disposition',
];

const STREAM_RULES = new Map<string, StreamRule>();
const MEDIA_BLOBS = new Map<string, BlobMetadata>();
const ELEMENT_BLOBS = new WeakMap<HTMLMediaElement, string>();
const ELEMENT_PENDING_REQUESTS = new WeakMap<HTMLMediaElement, Set<string>>();
const PROXY_CACHE = new Map<string, Promise<string | null>>();

/** Hosts that fail with userscript but work with the extension. */
const SOURCE_BLACKLIST = new Set(['fsharetv.co', 'lmscript.xyz']);

let fetchPatched = false;
let xhrPatched = false;
let mediaPatched = false;

const REQUEST_ORIGIN = (() => {
  try {
    const { origin, href } = pageWindow.location;
    if (origin && origin !== 'null') return origin;
    if (href) return new URL(href).origin;
  } catch {
    /* no-op */
  }
  return '*';
})();

// ─── Logging ─────────────────────────────────────────────────────────────────

const log = (...args: unknown[]): void => console.debug('[p-stream-userscript]', ...args);

// ─── Utilities ───────────────────────────────────────────────────────────────

const normalizeUrl = (input: string | undefined | null): string | null => {
  if (!input) return null;
  try {
    return new URL(input, pageWindow.location.href).toString();
  } catch {
    return null;
  }
};

const isSameOrigin = (url: string): boolean => {
  try {
    return new URL(url).origin === new URL(pageWindow.location.href).origin;
  } catch {
    return false;
  }
};

const makeFullUrl = (url: string, ops: { baseUrl?: string; query?: Record<string, string> } = {}): string => {
  let leftSide = ops.baseUrl ?? '';
  let rightSide = url;
  if (leftSide.length > 0 && !leftSide.endsWith('/')) leftSide += '/';
  if (rightSide.startsWith('/')) rightSide = rightSide.slice(1);
  const fullUrl = leftSide + rightSide;
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://'))
    throw new Error(`Invalid URL — URL doesn't start with http scheme: '${fullUrl}'`);

  const parsedUrl = new URL(fullUrl);
  Object.entries(ops.query ?? {}).forEach(([k, v]) => parsedUrl.searchParams.set(k, v));
  return parsedUrl.toString();
};

const parseHeaders = (raw: string | undefined): Record<string, string> => {
  const headers: Record<string, string> = {};
  (raw ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    });
  return headers;
};

const buildResponseHeaders = (
  rawHeaders: string | undefined,
  ruleHeaders: Record<string, string> | undefined,
  includeCredentials: boolean,
): Record<string, string> => {
  const headerMap: Record<string, string> = {
    ...DEFAULT_CORS_HEADERS,
    ...(ruleHeaders ?? {}),
    ...parseHeaders(rawHeaders),
  };

  if (includeCredentials) {
    headerMap['access-control-allow-credentials'] = 'true';
    if (!headerMap['access-control-allow-origin'] || headerMap['access-control-allow-origin'] === '*') {
      headerMap['access-control-allow-origin'] = REQUEST_ORIGIN;
    }
  }

  return headerMap;
};

const mapBodyToPayload = (body: unknown, bodyType: BodyType): unknown => {
  if (body == null) return undefined;
  switch (bodyType) {
    case 'FormData': {
      const formData = new FormData();
      (body as [string, string][]).forEach(([key, value]) => formData.append(key, value));
      return formData;
    }
    case 'URLSearchParams':
      return new URLSearchParams(body as string);
    case 'object':
      return JSON.stringify(body);
    case 'string':
      return body;
    default:
      return body;
  }
};

const normalizeBody = (body: unknown): unknown => {
  if (body == null) return undefined;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) return body;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body;
  if (typeof body === 'object') return JSON.stringify(body);
  return body;
};

const gmRequest = (options: GmRequestOptions): Promise<GmResponse> =>
  new Promise((resolve, reject) => {
    if (!gmXhr) {
      reject(new Error('GM_xmlhttpRequest missing; cannot proxy request'));
      return;
    }
    (gmXhr as Function)({
      ...options,
      onload: (response: GmResponse) => resolve(response),
      onerror: (error: unknown) => reject(error),
      ontimeout: () => reject(new Error('Request timed out')),
    });
  });

const shouldSendCredentials = (
  url: string | null,
  credentialsMode?: string,
  withCredentialsFlag = false,
): boolean => {
  if (!url) return false;
  if (withCredentialsFlag) return true;
  const sameOrigin = isSameOrigin(url);
  if (credentialsMode === 'omit') return false;
  if (credentialsMode === 'include') return true;
  return sameOrigin;
};

const findRuleForUrl = (url: string): StreamRule | null => {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const host = new URL(normalized).hostname;

  if (SOURCE_BLACKLIST.has(host)) {
    log('Skipping blacklisted source:', host);
    return null;
  }

  for (const rule of STREAM_RULES.values()) {
    if (rule.targetDomains?.some((d) => host === d || host.endsWith(`.${d}`))) return rule;
    if (rule.targetRegex) {
      try {
        if (new RegExp(rule.targetRegex).test(normalized)) return rule;
      } catch (err) {
        log('Invalid targetRegex in rule, skipping', err);
      }
    }
  }
  return null;
};

// ─── Media helpers ───────────────────────────────────────────────────────────

const makeBlobUrl = (
  data: ArrayBuffer | Uint8Array,
  contentType: string,
  originalUrl: string,
  element: HTMLMediaElement | null,
): string => {
  const blob = new Blob([data], { type: contentType || 'application/octet-stream' });
  const blobUrl = URL.createObjectURL(blob);
  MEDIA_BLOBS.set(blobUrl, {
    element,
    originalUrl,
    createdAt: Date.now(),
    size: data instanceof ArrayBuffer ? data.byteLength : data.length,
  });
  if (element) ELEMENT_BLOBS.set(element, blobUrl);
  return blobUrl;
};

const cleanupElementBlob = (element: HTMLMediaElement): void => {
  const blobUrl = ELEMENT_BLOBS.get(element);
  if (blobUrl) {
    try {
      URL.revokeObjectURL(blobUrl);
      MEDIA_BLOBS.delete(blobUrl);
      ELEMENT_BLOBS.delete(element);
    } catch (err) {
      log('Failed to revoke blob URL for element', err);
    }
  }
  const pendingRequests = ELEMENT_PENDING_REQUESTS.get(element);
  if (pendingRequests?.size) {
    pendingRequests.forEach((url) => PROXY_CACHE.delete(url));
    pendingRequests.clear();
  }
};

const proxyMediaIfNeeded = async (url: string, element: HTMLMediaElement | null = null): Promise<string | null> => {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  const cached = PROXY_CACHE.get(normalized);
  if (cached) return cached;

  const rule = findRuleForUrl(normalized);
  if (!rule) return null;

  if (element) {
    if (!ELEMENT_PENDING_REQUESTS.has(element)) ELEMENT_PENDING_REQUESTS.set(element, new Set());
    ELEMENT_PENDING_REQUESTS.get(element)!.add(normalized);
  }

  const expectedSrc = element ? (element.src || element.getAttribute('src')) : null;

  const proxyPromise = (async (): Promise<string | null> => {
    try {
      const response = await gmRequest({
        url: normalized,
        method: 'GET',
        headers: rule.requestHeaders,
        responseType: 'arraybuffer',
        withCredentials: true,
      });

      // Abort if src changed during download
      if (element) {
        const currentSrc = element.src || element.getAttribute('src');
        if (currentSrc !== expectedSrc && currentSrc !== normalized) {
          PROXY_CACHE.delete(normalized);
          ELEMENT_PENDING_REQUESTS.get(element)?.delete(normalized);
          return null;
        }
      }

      const headers = parseHeaders(response.responseHeaders);
      const contentType = headers['content-type'] ?? '';

      // Don't proxy HLS or DASH manifests
      if (
        contentType.includes('application/vnd.apple.mpegurl') ||
        contentType.includes('application/x-mpegurl') ||
        normalized.includes('.m3u8') ||
        contentType.includes('application/dash+xml') ||
        normalized.includes('.mpd')
      ) {
        return null;
      }

      const bodyBuffer =
        response.response instanceof ArrayBuffer
          ? response.response
          : new TextEncoder().encode((response.responseText ?? '') as string);

      const blobUrl = makeBlobUrl(bodyBuffer, contentType, normalized, element);
      ELEMENT_PENDING_REQUESTS.get(element ?? ({} as HTMLMediaElement))?.delete(normalized);
      return blobUrl;
    } catch (err) {
      log('Media proxy failed, falling back to original src', err);
      ELEMENT_PENDING_REQUESTS.get(element ?? ({} as HTMLMediaElement))?.delete(normalized);
      return null;
    } finally {
      setTimeout(() => PROXY_CACHE.delete(normalized), 1000);
    }
  })();

  PROXY_CACHE.set(normalized, proxyPromise);
  return proxyPromise;
};

// ─── Proxy initializers ──────────────────────────────────────────────────────

const ensureFetchProxy = (): void => {
  if (fetchPatched) return;
  fetchPatched = true;
  const win = pageWindow;
  const nativeFetch = win.fetch.bind(win);

  win.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const targetUrl = normalizeUrl(typeof input === 'string' ? input : (input as Request)?.url);
    if (!targetUrl) return nativeFetch(input, init);
    const rule = findRuleForUrl(targetUrl);
    if (!rule) return nativeFetch(input, init);

    const headers: Record<string, string> = {};
    const initHeaders =
      init.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : (init.headers as Record<string, string> | undefined);
    Object.assign(headers, rule.requestHeaders ?? {}, initHeaders ?? {});

    const method = init.method ?? 'GET';
    const payload = normalizeBody(init.body);
    const includeCredentials = shouldSendCredentials(targetUrl, init.credentials as string);

    try {
      const response = await gmRequest({
        url: targetUrl,
        method,
        data: payload,
        headers,
        responseType: 'arraybuffer',
        withCredentials: includeCredentials,
      });

      const headerMap = buildResponseHeaders(response.responseHeaders, rule.responseHeaders, includeCredentials);
      const bodyBuffer =
        response.response instanceof ArrayBuffer
          ? response.response
          : new TextEncoder().encode((response.responseText ?? '') as string);

      return new Response(bodyBuffer, {
        status: response.status,
        statusText: response.statusText ?? '',
        headers: headerMap,
      });
    } catch (err) {
      log('Proxy fetch failed, falling back to native', err);
      return nativeFetch(input, init);
    }
  };
};

// ─── Message listener (rules registration) ───────────────────────────────────

const handleMessage = (event: MessageEvent): void => {
  if (event.source !== pageWindow) return;

  const data = event.data as Record<string, unknown>;
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'p-stream/register-rule': {
      const rule = data.rule as StreamRule;
      if (!rule?.id) return;
      STREAM_RULES.set(rule.id, rule);
      ensureFetchProxy();
      log('Registered rule:', rule.id, rule.targetDomains ?? rule.targetRegex);
      break;
    }
    case 'p-stream/remove-rule': {
      const id = data.id as string;
      if (STREAM_RULES.delete(id)) log('Removed rule:', id);
      break;
    }
    case 'p-stream/ping': {
      pageWindow.postMessage({ type: 'p-stream/pong', version: SCRIPT_VERSION, hasGmXhr: !!gmXhr }, '*');
      break;
    }
    default:
      break;
  }
};

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('message', handleMessage);

// Announce presence to the P-Stream web app
pageWindow.dispatchEvent(
  new CustomEvent('p-stream-userscript-ready', {
    detail: { version: SCRIPT_VERSION, hasGmXhr: !!gmXhr },
  }),
);

log(`v${SCRIPT_VERSION} loaded — GM_xmlhttpRequest: ${!!gmXhr}`);
