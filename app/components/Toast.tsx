"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { takeFlash, type FlashNotice } from "../lib/api";

export type Notice = FlashNotice | null;

/** Notice state with auto-dismiss, plus any flash message left by the previous route. */
export function useNotice() {
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(takeFlash()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return [notice, setNotice] as const;
}

export function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  const Icon = notice.tone === "error" ? TriangleAlert : notice.tone === "success" ? CircleCheck : Info;
  return (
    <div className={`toast toast-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <Icon size={20} />
      <p>{notice.text}</p>
      <button type="button" aria-label="Dismiss" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
