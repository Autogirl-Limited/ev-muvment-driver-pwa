export const naira = (value: number | null | undefined) => `₦${Number(value ?? 0).toLocaleString()}`;

/** Calendar date (YYYY-MM-DD) in Nigeria time, which is what the API filters on. */
export function lagosDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(date);
}

export const kwh = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Picks the photo in /public/images/cars-type that matches a vehicle type name like "Electric SUV". */
export function vehicleImage(typeName: string | null | undefined) {
  const name = (typeName ?? "").toLowerCase();
  const suv = name.includes("suv");
  const electric = name.includes("electric") || /\bev\b/.test(name) || !name; // an EV fleet: default to the electric look
  const file = suv ? (electric ? "electric-suv.webp" : "suv.webp") : electric ? "electric-sedan.png" : "sedan.png";
  return `/images/cars-type/${file}`;
}
