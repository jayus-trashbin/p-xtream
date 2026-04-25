/**
 * Userscript Proxy Adapter
 *
 * Bridges the P-Stream web app to the P-Stream Userscript,
 * which uses window.postMessage to proxy CORS-blocked requests
 * via GM_xmlhttpRequest.
 *
 * Protocol supported:
 *   - Old userscript: relay({name}) — postMessage with {name, instanceId, body}
 *   - New userscript: p-stream/ping → p-stream/pong + p-stream/register-rule
 *
 * Detection: listens for 'p-stream-userscript-ready' CustomEvent
 * or pong reply to a ping.
 */

import { ExtensionMakeRequestResponse } from "@/backend/extension/plasmo";

type UserscriptVersion = "relay" | "rule-based" | null;

let detectedVersion: UserscriptVersion = null;
let instanceCounter = 0;

// ─── Detection ────────────────────────────────────────────────────────────────

const detectionPromise: Promise<UserscriptVersion> = new Promise((resolve) => {
  // Listen for the CustomEvent dispatched by the new userscript on load
  window.addEventListener(
    "p-stream-userscript-ready",
    () => resolve("rule-based"),
    { once: true },
  );

  // Ping for the old relay-style userscript
  const pingTimeout = setTimeout(() => {
    resolve(null); // nothing answered
  }, 800);

  const pongListener = (event: MessageEvent) => {
    const data = event.data as Record<string, unknown>;
    if (!data) return;

    // New userscript answers p-stream/pong
    if (data.type === "p-stream/pong") {
      clearTimeout(pingTimeout);
      window.removeEventListener("message", pongListener);
      resolve("rule-based");
      return;
    }

    // Old relay userscript answers: {name: 'hello', relayed: true}
    if (data.name === "hello" && data.relayed === true) {
      clearTimeout(pingTimeout);
      window.removeEventListener("message", pongListener);
      resolve("relay");
    }
  };

  window.addEventListener("message", pongListener);

  // Try both protocols simultaneously
  window.postMessage({ type: "p-stream/ping" }, "*");
  window.postMessage(
    { name: "hello", instanceId: "detect", body: undefined },
    "*",
  );
});

detectionPromise.then((v) => {
  detectedVersion = v;
  if (v) console.debug("[p-stream] Userscript detected:", v);
});

// ─── Relay-style messaging (old userscript) ──────────────────────────────────

function sendRelayMessage<T>(
  name: string,
  body: unknown,
  timeout = 10000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const instanceId = `relay-${++instanceCounter}-${Date.now()}`;
    const timer = setTimeout(() => {
      window.removeEventListener("message", listener);
      resolve(null);
    }, timeout);

    const listener = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown>;
      if (
        data?.name === name &&
        data.relayed === true &&
        data.instanceId === instanceId
      ) {
        clearTimeout(timer);
        window.removeEventListener("message", listener);
        resolve(data.body as T);
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ name, instanceId, body }, "*");
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function isUserscriptActive(): Promise<boolean> {
  const version = await detectionPromise;
  return version !== null;
}

export function isUserscriptActiveCached(): boolean {
  return detectedVersion !== null;
}

export async function getUserscriptVersion(): Promise<string | null> {
  if (detectedVersion !== "relay" && detectedVersion !== "rule-based")
    return null;
  // Query version from old relay-style
  if (detectedVersion === "relay") {
    const res = await sendRelayMessage<{ success: boolean; version?: string }>(
      "hello",
      undefined,
      1000,
    );
    return (res as any)?.version ?? null;
  }
  return null;
}

/**
 * Make an HTTP request via the userscript (bypasses CORS via GM_xmlhttpRequest).
 * Maps to the same interface as sendExtensionRequest.
 */
export async function sendUserscriptRequest<T>(
  ops: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string | Record<string, unknown>;
    bodyType?: "string" | "FormData" | "URLSearchParams" | "object";
    readHeaders: string[];
    baseUrl?: string;
    query?: Record<string, string>;
  },
): Promise<ExtensionMakeRequestResponse<T> | null> {
  const version = detectedVersion ?? (await detectionPromise);
  if (!version) return null;

  // Build full URL with query params
  let targetUrl = ops.url;
  if (ops.baseUrl) {
    const base = ops.baseUrl.endsWith("/") ? ops.baseUrl : ops.baseUrl + "/";
    const path = ops.url.startsWith("/") ? ops.url.slice(1) : ops.url;
    targetUrl = base + path;
  }
  if (ops.query) {
    const u = new URL(targetUrl);
    Object.entries(ops.query).forEach(([k, v]) => u.searchParams.set(k, v));
    targetUrl = u.toString();
  }

  if (version === "relay") {
    const res = await sendRelayMessage<ExtensionMakeRequestResponse<T>>(
      "makeRequest",
      { ...ops, url: targetUrl },
    );
    return res;
  }

  // rule-based userscript does NOT support arbitrary makeRequest calls —
  // it patches fetch/XHR globally based on registered rules.
  // We fall back to a direct fetch (the userscript's patched fetch will handle it).
  try {
    const response = await fetch(targetUrl, {
      method: ops.method,
      headers: ops.headers as HeadersInit,
      body:
        ops.body != null
          ? typeof ops.body === "string"
            ? ops.body
            : JSON.stringify(ops.body)
          : undefined,
    });
    const body = await response.json().catch(() => response.text());
    const headers: Record<string, string> = {};
    ops.readHeaders.forEach((h) => {
      const v = response.headers.get(h);
      if (v) headers[h.toLowerCase()] = v;
    });
    return {
      success: true,
      response: {
        statusCode: response.status,
        headers,
        finalUrl: response.url,
        body: body as T,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Register a stream rule in the userscript (new rule-based protocol).
 * In the old relay protocol, send a prepareStream message.
 */
export async function registerUserscriptRule(rule: {
  id: string;
  targetDomains?: string[];
  targetRegex?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}): Promise<boolean> {
  const version = detectedVersion ?? (await detectionPromise);
  if (!version) return false;

  if (version === "rule-based") {
    window.postMessage({ type: "p-stream/register-rule", rule }, "*");
    return true;
  }

  if (version === "relay") {
    const res = await sendRelayMessage<{ success: boolean }>(
      "prepareStream",
      {
        ruleId: rule.id,
        targetDomains: rule.targetDomains ?? [],
        requestHeaders: rule.requestHeaders,
        responseHeaders: rule.responseHeaders,
      },
    );
    return res?.success ?? false;
  }

  return false;
}

export function removeUserscriptRule(id: string): void {
  window.postMessage({ type: "p-stream/remove-rule", id }, "*");
}
