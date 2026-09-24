/** "just now", "5 min ago", "3 h ago", or a short date for anything older than a day or two. */
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Section label for a list grouped by Nigeria calendar day. */
export function dayLabel(iso: string, now = Date.now()) {
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(ms));
  const target = day(Date.parse(iso));
  if (target === day(now)) return "Today";
  if (target === day(now - 86_400_000)) return "Yesterday";
  return new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "long" }).format(new Date(iso));
}
