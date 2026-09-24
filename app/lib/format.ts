export const naira = (value: number | null | undefined) => `₦${Number(value ?? 0).toLocaleString()}`;

/** Calendar date (YYYY-MM-DD) in Nigeria time, which is what the API filters on. */
export function lagosDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(date);
}

export const kwh = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
