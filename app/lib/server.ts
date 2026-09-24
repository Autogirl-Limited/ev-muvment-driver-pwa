// Server-only: the real backend location never reaches the browser.
const base = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export const BACKEND_URL = `${base.replace(/\/$/, "")}/api/v1`;
