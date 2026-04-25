import { conf } from "@/setup/config";

export function processCdnLink(url: string): string {
  const parsedUrl = new URL(url);
  const replacements = conf().CDN_REPLACEMENTS;
  for (const replacement of replacements) {
    const before = replacement[0];
    const after = replacement[1];
    if (!before || !after) continue;
    if (parsedUrl.hostname.endsWith(before)) {
      parsedUrl.hostname = after;
      parsedUrl.port = "";
      parsedUrl.protocol = "https://";
      return parsedUrl.toString();
    }
  }

  return url;
}
