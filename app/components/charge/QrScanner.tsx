"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff } from "lucide-react";

const SCAN_EVERY_MS = 120;

/** Live camera view that reads QR codes on any phone (no reliance on the browser's BarcodeDetector). */
export function QrScanner({ onScan, onError }: { onScan: (text: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const handlers = useRef({ onScan, onError });
  useEffect(() => {
    handlers.current = { onScan, onError };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let last = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const fail = (message: string) => {
      setFailed(true);
      handlers.current.onError(message);
    };

    const tick = (time: number) => {
      if (stopped) return;
      const el = video.current;
      if (el && context && el.readyState >= el.HAVE_ENOUGH_DATA && time - last > SCAN_EVERY_MS) {
        last = time;
        // Scan a downscaled copy: plenty for a QR code and much lighter on a phone.
        const scale = Math.min(1, 640 / el.videoWidth);
        canvas.width = Math.round(el.videoWidth * scale);
        canvas.height = Math.round(el.videoHeight * scale);
        context.drawImage(el, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        const text = code?.data.trim();
        if (text) {
          stopped = true;
          navigator.vibrate?.(60);
          handlers.current.onScan(text);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      fail("This browser can't open the camera. Enter the charger ID instead.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (media) => {
        if (stopped) return media.getTracks().forEach((track) => track.stop());
        stream = media;
        const el = video.current;
        if (!el) return;
        el.srcObject = media;
        await el.play();
        frame = requestAnimationFrame(tick);
      })
      .catch((error: DOMException) =>
        fail(
          error.name === "NotAllowedError"
            ? "Camera access is off. Allow the camera in your browser settings, or enter the charger ID instead."
            : "We couldn't start the camera. Enter the charger ID instead.",
        ),
      );

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (failed) {
    return (
      <div className="qr qr-off">
        <CameraOff size={34} />
        <span>Camera unavailable</span>
      </div>
    );
  }

  return (
    <div className="qr">
      <video muted playsInline ref={video} />
      <span className="qr-frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <b />
      </span>
    </div>
  );
}
