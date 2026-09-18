# Driver PWA Phases and Mobile Reliability Audit

## Phase 1 - Discovery and App Mapping

- Source app reviewed: `../ev-driver`.
- Real API contracts currently present: auth, two-factor login, token refresh, profile, driver application, password flows, and notifications.
- Driver operational surfaces currently present as mock-backed screens: home shift dashboard, charging, activity, payment lookup, profile details.
- Security-sensitive areas identified: token storage, refresh handling, wallet balance display, virtual account display, payment lookup, notification reads, and future shift actions.

## Phase 2 - PWA Foundation

- Added an installable Next.js PWA foundation in `ev-driver-pwa`.
- Added app metadata and manifest generation.
- Added a service worker for app-shell/static asset caching.
- Added typed API boundary matching the mobile app response envelope.
- Added client session bootstrapping, refresh-on-401, and guarded storage parsing.

## Phase 3 - Core Driver Flows

- Implemented login with EMAIL OTP/TOTP challenge support.
- Implemented authenticated home, activity, charging, payment lookup, and profile tabs.
- Reused the current mobile app mock domain data for driver shift, vehicle, charging, and payment surfaces.
- Loaded profile and notifications from the existing API when a valid session is available.

## Phase 4 - Device Capabilities

- Added installability through manifest metadata and app icons.
- Added service worker registration in the client runtime.
- Added browser online/offline detection and a visible offline banner.
- Push notifications and geolocation are not enabled yet because the current mobile app does not show backend subscription/location endpoints for the driver PWA to call safely.

## Phase 5 - Offline and Reliability

- Added cached app shell/static assets for repeat visits.
- Added corrupt-session recovery for web storage.
- Added explicit network-error classification in the PWA API client.
- Added a local offline action queue abstraction for future retryable driver actions.
- Wired the current "Start Drop-off" UI to queue a typed action instead of inventing server behavior.

## Mobile App Offline and Reliability Findings

- Native session storage uses `expo-secure-store`, which is appropriate for mobile token storage.
- The mobile web fallback uses `localStorage` and parses JSON without corruption recovery; a bad stored value can break session boot.
- The mobile API client does not currently classify network failures separately from server/API failures.
- Auth requests refresh once on `401`, which is a good reliability baseline.
- Refresh is single-flight guarded through `refreshPromiseRef`, preventing duplicate refresh storms.
- The current operational screens are mock-backed, so offline correctness for shift actions, payment lookups, charging updates, and activity history cannot yet be verified against real endpoints.
- There is no mobile offline queue or replay strategy for future driver actions.
- There is no explicit NetInfo/offline banner in the native app, so drivers may see generic request failures during connectivity drops.

## Recommended Next Mobile Reliability Fixes

- Add guarded JSON parsing in `src/auth/session-storage.web.ts`.
- Wrap `fetch` in `src/api/client.ts` to convert network errors into a typed `ApiError` with `code: "NETWORK_ERROR"` and `statusCode: 0`.
- Add a native connectivity indicator using Expo-compatible network state once the dependency decision is approved.
- Add an allowlisted action queue only for idempotent or server-idempotency-key-backed mutations.
- Do not queue wallet/payment settlement actions unless the backend provides idempotency keys and ownership validation.
