import type { DateRange } from "./api";

export const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
] as const;

export type DateFilter =
  | { preset: "today" | "week" | "month" | "all" }
  | { preset: "custom"; from: string; to: string };

/** Treat API dates as calendar days, independent of the device's timezone. */
export function dateFromKey(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number) {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function shiftMonth(key: string, offset: number) {
  const date = dateFromKey(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return dateKey(date);
}

export function resolveDateFilter(filter: DateFilter, today: string): DateRange {
  switch (filter.preset) {
    case "today": return { from: today, to: today };
    case "week": return { from: addDays(today, -6), to: today };
    case "month": return { from: `${today.slice(0, 8)}01`, to: today };
    case "all": return {};
    case "custom": return { from: filter.from, to: filter.to };
  }
}

export function formatCalendarDate(key: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", ...options, timeZone: "UTC",
  }).format(dateFromKey(key));
}

export function dateFilterLabel(filter: DateFilter) {
  if (filter.preset !== "custom") return DATE_PRESETS.find((item) => item.key === filter.preset)!.label;
  const options = filter.from.slice(0, 4) !== filter.to.slice(0, 4) ? { year: "2-digit" as const } : undefined;
  const from = formatCalendarDate(filter.from, options);
  return filter.from === filter.to ? from : `${from} – ${formatCalendarDate(filter.to, options)}`;
}

/** A fixed six-week, Monday-first grid keeps the dialog steady between months. */
export function calendarDays(month: string) {
  const first = `${month.slice(0, 8)}01`;
  const offset = (dateFromKey(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => addDays(first, index - offset));
}
