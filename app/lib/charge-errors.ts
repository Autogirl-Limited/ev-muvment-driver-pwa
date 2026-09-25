import { ApiError } from "./api";

/**
 * Driver-friendly copy for charging failures. The backend's 402/502/503 text is written for admins and
 * engineers, so those are replaced rather than shown.
 */
export function chargeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (error.statusCode) {
    case 0:
      return error.message; // offline: already worded for the driver
    case 400:
      return error.message; // "no vehicle assigned yet" is written for drivers
    case 402:
      return "We couldn't start this charge right now. Please try again or contact support.";
    case 404:
      return "We couldn't find that charger. Scan the code again.";
    case 409:
      return "That connector was just taken. Please pick another one.";
    case 422:
      return "That doesn't look like a valid charger code.";
    case 502:
    case 503:
      return "We couldn't reach the charger. Make sure your vehicle is plugged in and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** A start that may or may not have gone through: no response at all, or the provider timing out. */
export const isUncertain = (error: unknown) => error instanceof ApiError && [0, 502, 504].includes(error.statusCode);
