import { NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "../../lib/access-token";
import { BACKEND_URL } from "../../lib/server";

/**
 * Uploads a checklist photo on the browser's behalf. The browser used to PUT straight to cloud
 * storage, which is cross-origin and fails (looking like "offline") when the bucket's CORS or
 * network rules don't allow it. Here the server asks the backend for the signed URL and does the
 * PUT itself, so the browser only ever talks to this app. The signed URL never leaves the server.
 */
const ID = /^[0-9a-fA-F-]{36}$/;
const IMAGE_TYPES = /^[A-Z_]{2,40}$/;
const MAX_BYTES = 6 * 1024 * 1024;

const fail = (status: number, message: string) =>
  NextResponse.json({ status: "error", message, data: null, error: null }, { status });

export async function POST(request: NextRequest) {
  const checklistId = request.nextUrl.searchParams.get("checklist") ?? "";
  const imageType = request.nextUrl.searchParams.get("type") ?? "";
  if (!ID.test(checklistId) || !IMAGE_TYPES.test(imageType)) return fail(400, "Invalid upload request.");

  const token = await readSessionToken(request);
  if (!token?.accessToken) return fail(401, "Your session has expired. Please sign in again.");

  const photo = await request.arrayBuffer();
  if (photo.byteLength === 0) return fail(400, "No photo received.");
  if (photo.byteLength > MAX_BYTES) return fail(413, "That photo is too large.");

  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token.accessToken}` };

  try {
    const prepared = await fetch(`${BACKEND_URL}/daily-checklists/${checklistId}/uploads`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ files: [{ image_type: imageType, content_type: "image/jpeg" }] }),
      cache: "no-store",
    });
    const preparedBody = await prepared.json().catch(() => null);
    if (!prepared.ok) return fail(prepared.status, preparedBody?.message ?? "Couldn't prepare the upload.");
    const target = preparedBody?.data?.[0];
    if (!target?.upload_url) return fail(502, "Couldn't prepare the upload. Please try again.");

    const stored = await fetch(target.upload_url, {
      method: target.method || "PUT",
      headers: target.headers ?? {},
      body: photo,
      cache: "no-store",
    });
    if (!stored.ok) return fail(502, "The photo didn't upload. Please try again.");

    const registered = await fetch(`${BACKEND_URL}/daily-checklists/${checklistId}/images`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ image_type: imageType, object_key: target.object_key }),
      cache: "no-store",
    });
    return new NextResponse(await registered.text(), {
      status: registered.status,
      headers: { "Content-Type": registered.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return fail(502, "Unable to reach the server. Please try again.");
  }
}
