"use client";

import { useEffect, useState } from "react";
import { FingerprintPattern } from "lucide-react";
import { toast } from "sonner";
import {
  biometricLabel,
  deviceHasPasskey,
  dismissPasskeyPrompt,
  isAlreadyRegistered,
  passkeyErrorMessage,
  passkeyPromptSnoozed,
  passkeysSupported,
  setDeviceHasPasskey,
} from "../lib/passkey";
import { useAddPasskey } from "../lib/queries";
import { Modal } from "./Modal";
import { Spinner } from "./Ui";

/**
 * Suggests fingerprint / face sign-in once the driver is in, but only on a phone that
 * supports it and isn't set up yet. "Not now" waits two weeks before asking again.
 */
export function PasskeyPrompt() {
  const [open, setOpen] = useState(false);
  const add = useAddPasskey();
  const sensor = biometricLabel();

  useEffect(() => {
    if (deviceHasPasskey() || passkeyPromptSnoozed()) return;
    let cancelled = false;
    // Let the home screen settle before asking.
    const timer = window.setTimeout(() => {
      void passkeysSupported().then((ok) => {
        if (ok && !cancelled) setOpen(true);
      });
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  function later() {
    dismissPasskeyPrompt();
    setOpen(false);
  }

  function turnOn() {
    add.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        toast.success(`Done. Next time, sign in with ${sensor}.`);
      },
      onError: (error) => {
        if (isAlreadyRegistered(error)) {
          setDeviceHasPasskey(true);
          setOpen(false);
          return;
        }
        // Closing the phone's prompt isn't an error: leave the choice on screen.
        const message = passkeyErrorMessage(error);
        if (message) toast.error(message);
      },
    });
  }

  const busy = add.isPending;

  return (
    <Modal dismissible={!busy} label="Turn on fingerprint sign-in" open={open} onClose={later}>
      <div className="confirm">
        <span className="confirm-icon"><FingerprintPattern size={26} /></span>
        <h2>Sign in with {sensor}</h2>
        <p>Next time, skip the password. Just use your {sensor} to open the app.</p>
        <div className="confirm-actions">
          <button className="primary-button" disabled={busy} type="button" onClick={turnOn}>
            {busy ? <Spinner /> : <FingerprintPattern size={20} />} Turn on
          </button>
          <button className="ghost-button" disabled={busy} type="button" onClick={later}>Not now</button>
        </div>
        <p className="passkey-note">
          Your fingerprint or face stays on your phone. We never see it. You can turn this off in Profile, Sign-in security.
        </p>
      </div>
    </Modal>
  );
}
