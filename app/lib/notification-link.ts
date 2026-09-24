import type { AppNotification } from "./types";

/** Where tapping a notification goes: an in-app path from `web_url`, else the notifications list. */
export function notificationTarget(n: Pick<AppNotification, "web_url">) {
  const url = n.web_url?.trim();
  if (!url) return "/notifications";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}`;
  } catch {
    /* not a URL */
  }
  return "/notifications"; // never send the driver to an outside address from a push
}
