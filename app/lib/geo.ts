import type { Position } from "./api";

/** Current GPS fix, or a rejection whose message is fit to show the driver. */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device can't share its location, so the checklist can't be started."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location is turned off. Allow location for this app in your browser settings, then try again."
              : error.code === error.TIMEOUT
                ? "We couldn't get your location in time. Move to an open area and try again."
                : "We couldn't work out where you are. Check your GPS and try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  });
}
