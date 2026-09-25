"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, uploadChecklistPhoto } from "./api";
import { compressImage } from "./image";
import { putChecklist } from "./queries";
import type { ImageType } from "./types";

export type PhotoState = {
  /** Local preview of what the driver just took; the server's signed link is used otherwise. */
  preview?: string;
  status: "idle" | "processing" | "uploading" | "error";
  progress: number;
  error?: string;
};

const IDLE: PhotoState = { status: "idle", progress: 0 };

/** Compress → get signed URL → PUT to storage → register. One photo at a time per slot; retakes replace. */
export function usePhotoUploads(checklistId: string | undefined) {
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState<Partial<Record<ImageType, PhotoState>>>({});
  const blobs = useRef<Partial<Record<ImageType, Blob>>>({});
  const previews = useRef<string[]>([]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const patch = useCallback((type: ImageType, next: Partial<PhotoState>) => {
    setPhotos((all) => ({ ...all, [type]: { ...(all[type] ?? IDLE), ...next } }));
  }, []);

  const send = useCallback(
    async (type: ImageType, blob: Blob) => {
      if (!checklistId) return;
      patch(type, { status: "uploading", progress: 0, error: undefined });
      try {
        const checklist = await uploadChecklistPhoto(checklistId, type, blob, (progress) => patch(type, { progress }));
        putChecklist(queryClient, checklist);
        patch(type, { status: "idle", progress: 1 });
      } catch (error) {
        patch(type, { status: "error", error: error instanceof ApiError || error instanceof Error ? error.message : "Upload failed." });
      }
    },
    [checklistId, patch, queryClient],
  );

  const capture = useCallback(
    async (type: ImageType, file: File) => {
      patch(type, { status: "processing", progress: 0, error: undefined });
      try {
        const blob = await compressImage(file);
        blobs.current[type] = blob;
        const preview = URL.createObjectURL(blob);
        previews.current.push(preview);
        patch(type, { preview });
        await send(type, blob);
      } catch (error) {
        patch(type, { status: "error", error: error instanceof Error ? error.message : "Couldn't use that photo." });
      }
    },
    [patch, send],
  );

  const retry = useCallback(
    (type: ImageType) => {
      const blob = blobs.current[type];
      if (blob) void send(type, blob);
    },
    [send],
  );

  return { photos, capture, retry };
}
