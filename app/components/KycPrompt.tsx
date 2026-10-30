"use client";

import { useEffect, useState } from "react";
import { ChevronRight, IdCard, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../lib/api";
import { useKycStatus, useSaveKyc } from "../lib/queries";
import { SegmentedControl, TextField } from "./FormControls";
import { Modal } from "./Modal";
import { Spinner } from "./Ui";

type KycMode = "nin" | "bvn";

const SNOOZE_KEY = "muvment.kyc-prompt-snoozed";

/** "Later" only lasts until the app is closed: we ask again on the next visit. */
function snoozedThisVisit() {
  try {
    return window.sessionStorage.getItem(SNOOZE_KEY) === "1";
  } catch {
    return false;
  }
}

function snoozeThisVisit() {
  try {
    window.sessionStorage.setItem(SNOOZE_KEY, "1");
  } catch {
    /* private mode: we just ask again sooner */
  }
}

/** Asks for a BVN or NIN. Used on its own from Profile, and by KycPrompt on the home screen. */
export function KycDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const save = useSaveKyc();
  const [mode, setMode] = useState<KycMode>("nin");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  const isNin = mode === "nin";
  const busy = save.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{11}$/.test(value)) {
      setError(`Your ${isNin ? "NIN" : "BVN"} is 11 digits.`);
      return;
    }
    save.mutate(isNin ? { nin: value } : { bvn: value }, {
      onSuccess: () => {
        setValue("");
        onClose();
        toast.success(`Thanks. Your ${isNin ? "NIN" : "BVN"} is saved.`);
      },
      onError: (err) => {
        const fieldError = err instanceof ApiError ? err.fieldErrors[mode] : undefined;
        if (fieldError) setError(fieldError);
        else toast.error(err.message);
      },
    });
  }

  return (
    <Modal dismissible={!busy} label="Add your BVN or NIN" open={open} onClose={onClose}>
      <form className="confirm kyc-form" noValidate onSubmit={submit}>
        <span className="confirm-icon"><ShieldCheck size={26} /></span>
        <h2>Add your BVN or NIN</h2>
        <p>We need one of them to keep your Muvment bank account working, so your payments always land.</p>

        <SegmentedControl
          label="ID type"
          options={[{ value: "nin", label: "NIN" }, { value: "bvn", label: "BVN" }]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setError(undefined);
          }}
        />
        <TextField
          autoFocus
          error={error}
          icon={<ShieldCheck size={18} />}
          inputMode="numeric"
          label={isNin ? "National Identification Number" : "Bank Verification Number"}
          maxLength={11}
          placeholder={isNin ? "12345678901" : "22123456789"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, ""));
            setError(undefined);
          }}
        />
        <small className="kyc-hint">
          {isNin ? "Dial *346# on the phone line you used to register to see your NIN." : "Dial *565*0# on your bank phone line to see your BVN."}
        </small>

        <div className="confirm-actions">
          <button className="primary-button" disabled={busy || value.length !== 11} type="submit">
            {busy ? <Spinner /> : <ShieldCheck size={20} />} Save
          </button>
          <button className="ghost-button" disabled={busy} type="button" onClick={onClose}>Later</button>
        </div>
        <p className="passkey-note">
          <Lock size={12} /> Stored encrypted and only shared with our bank partner. We never show it again.
        </p>
      </form>
    </Modal>
  );
}

/**
 * Keeps asking the driver for a BVN or NIN on every visit until one is on file.
 * Reports whether it's still due so other home-screen prompts can wait their turn.
 */
export function KycPrompt({ onDueChange }: { onDueChange?: (due: boolean) => void }) {
  const { data: kyc } = useKycStatus();
  const [open, setOpen] = useState(false);
  const due = kyc ? !kyc.has_kyc : undefined;

  useEffect(() => {
    if (due === undefined) return;
    onDueChange?.(due);
    if (!due || snoozedThisVisit()) return;
    // Let the home screen settle before asking.
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [due, onDueChange]);

  function close() {
    if (due) snoozeThisVisit();
    setOpen(false);
  }

  return <KycDialog open={open} onClose={close} />;
}

/** Stays at the top of the home screen until a BVN or NIN is on file, even after "Later". */
export function KycBanner() {
  const { data: kyc } = useKycStatus();
  const [open, setOpen] = useState(false);
  if (!kyc || kyc.has_kyc) return null;

  return (
    <>
      <button className="panel list-row kyc-banner" type="button" onClick={() => setOpen(true)}>
        <span className="list-icon list-icon-warn"><IdCard size={18} /></span>
        <div>
          <strong>Add your BVN or NIN</strong>
          <small>Needed to keep your bank account working. Takes a minute.</small>
        </div>
        <ChevronRight size={18} />
      </button>
      <KycDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
