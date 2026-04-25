import { isExtensionActive } from "@/backend/extension/messaging";
import { isUserscriptActive } from "@/backend/userscript/userscriptMessaging";
import { useAuthStore } from "@/stores/auth";

let hasExtension: boolean | null = null;
let hasUserscript: boolean | null = null;

export async function hasProxyCheck(): Promise<boolean> {
  if (hasExtension === null) {
    hasExtension = await isExtensionActive();
  }
  if (hasUserscript === null) {
    hasUserscript = await isUserscriptActive();
  }
  const hasProxy = Boolean(useAuthStore.getState().proxySet);
  return hasExtension || hasUserscript || hasProxy;
}
