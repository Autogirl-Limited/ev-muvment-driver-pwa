# Muvment Driver PWA

Installable PWA version of the existing `ev-driver` mobile application.

## What is implemented

- PWA manifest and service worker registration.
- Auth/session flow matching the mobile app API envelope.
- Login with EMAIL OTP/TOTP challenge support.
- Driver tabs for home, activity, charging, payment lookup, and profile.
- Offline banner, cached shell/assets, guarded session parsing, and queued retryable driver actions.
- Phase/audit notes in `docs/pwa-phases-and-mobile-reliability.md`.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Set `NEXT_PUBLIC_API_BASE_URL` to override the default staging API:

```bash
NEXT_PUBLIC_API_BASE_URL=https://example.com npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

## Notes

The mobile app currently has mock-backed operational driver screens. The PWA keeps those same surfaces mock-backed until the backend exposes stable shift, charging, activity, and payment lookup endpoints. Future queued mutations should be allowlisted and backed by server-side idempotency.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
