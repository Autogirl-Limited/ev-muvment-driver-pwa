import { ApiError } from "./api";

/**
 * Driver-friendly copy for charging failures. The 400 (no vehicle) and 402 (wallet too low) messages are written
 * for drivers and shown as they are; 502/503 text comes from the provider or ops, so it is replaced.
 */
export function chargeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (error.statusCode) {
    case 0:
      return error.message; // offline: already worded for the driver
    case 400:
      return error.message; // "no vehicle assigned yet" is written for drivers
    case 402:
      return error.message || "Your EV wallet balance isn't enough for this amount. Choose a smaller amount, or top up your wallet.";
    case 404:
      return "We couldn't find that charger. Scan the code again.";
    case 409:
      return "That connector was just taken. Please pick another one.";
    case 422:
      return "That doesn't look like a valid charger code.";
    case 502:
      return "We couldn't reach the charger. Make sure your vehicle is plugged in and try again.";
    case 503:
      return "Charging isn't available right now. Please try again later or contact support.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Paying an operator's price (`/charging-sessions/confirm`) has a few failures of its own. */
export function confirmError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 403 || error.statusCode === 404) return "This charge has already been paid for or has ended. Please scan the charger and try again.";
    // Not priced yet, the 5-minute window ran out, or the plug was taken: the server's text says which.
    if (error.statusCode === 409) return error.message || "This price is no longer valid. Ask the attendant for a new one.";
  }
  return chargeError(error);
}

export const isStatus = (error: unknown, status: number) => error instanceof ApiError && error.statusCode === status;

/** A start that may or may not have gone through: no response at all, or the provider timing out. */
export const isUncertain = (error: unknown) => error instanceof ApiError && [0, 502, 504].includes(error.statusCode);
