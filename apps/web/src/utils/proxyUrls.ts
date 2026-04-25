import { conf } from "@/setup/config";
import { useAuthStore } from "@/stores/auth";

const originalUrls = conf().PROXY_URLS;
const types = ["proxy"] as const;

type ParsedUrlType = (typeof types)[number];

export interface ParsedUrl {
  url: string;
  type: ParsedUrlType;
}

function canParseUrl(url: string): boolean {
  try {
    return !!new URL(url);
  } catch {
    return false;
  }
}

function isParsedUrlType(type: string): type is ParsedUrlType {
  return types.includes(type as any);
}

/**
 * Turn a string like "a=b;c=d;d=e" into a dictionary object
 */
function parseParams(input: string): Record<string, string> {
  const entriesParams = input
    .split(";")
    .map((param) => param.split("=", 2).filter((part) => part.length !== 0))
    .filter((v) => v.length === 2);
  return Object.fromEntries(entriesParams);
}

export function getParsedUrls() {
  const urls = useAuthStore.getState().proxySet ?? originalUrls;
  const output: ParsedUrl[] = [];
  urls.forEach((url) => {
    if (!url.startsWith("|")) {
      if (canParseUrl(url)) {
        output.push({
          url,
          type: "proxy",
        });
        return;
      }
    }

    const match = /^\|([^|]+)\|(.*)$/g.exec(url);
    const matchParams = match?.[1];
    const matchUrl = match?.[2];
    if (!matchUrl || !matchParams) return;
    if (!canParseUrl(matchUrl)) return;
    const params = parseParams(matchParams);
    const type = params.type ?? "proxy";

    if (!isParsedUrlType(type)) return;
    output.push({
      url: matchUrl,
      type,
    });
  });

  return output;
}

export function getProxyUrls() {
  return getParsedUrls()
    .filter((v) => v.type === "proxy")
    .map((v) => v.url);
}

export function getM3U8ProxyUrls(): string[] {
  return conf().M3U8_PROXY_URLS;
}
