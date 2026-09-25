/**
 * What a charger's QR code holds. LotGrids prints a map link such as
 * https://staging.map.lotgrids.com/?charge=Lotgrids/demo/lag/vi/01A and the charger id is the `charge` value.
 * A bare id (typed by hand, or an older sticker) is used as it is.
 */
export function chargerIdFrom(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const id = url.searchParams.get("charge")?.trim();
    if (id) return id.slice(0, 200);
    // A link without a charge parameter is some other QR code, not a charger.
    return null;
  } catch {
    /* not a URL: fall through */
  }

  // "…?charge=ID" pasted without a scheme.
  const match = raw.match(/[?&]charge=([^&#\s]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]).slice(0, 200);
    } catch {
      return match[1].slice(0, 200);
    }
  }

  return /^https?:\/\//i.test(raw) ? null : raw.slice(0, 200);
}
