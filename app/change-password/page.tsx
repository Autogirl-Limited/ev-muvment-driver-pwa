"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { TextField } from "../components/FormControls";
import { ScreenBar, ScreenTitle, Spinner, StrengthMeter } from "../components/Ui";
import { useChangePassword } from "../lib/queries";
import { clearTemporaryPassword, getTemporaryPassword } from "../lib/temp-password";

export default function ChangePasswordPage() {
  const router = useRouter();
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Prefill from sign-in (sessionStorage only exists in the browser, so do it after mount).
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentPassword(getTemporaryPassword()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          clearTemporaryPassword();
          toast.success("Password changed successfully.");
          router.replace("/");
          router.refresh();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const busy = change.isPending || change.isSuccess;

  return (
    <div className="screen-enter">
      <ScreenBar />
      <form autoComplete="off" className="form" onSubmit={handleSubmit}>
        <ScreenTitle title="Set your own password">Your temporary password is already filled in, so this only takes a moment.</ScreenTitle>
        <TextField icon={<Lock size={18} />} label="Temporary password" placeholder="Temporary password" required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <div className="stack-tight">
          <TextField icon={<KeyRound size={18} />} label="New password" minLength={8} placeholder="At least 8 characters" required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <StrengthMeter value={newPassword} />
        </div>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Spinner /> : null}
            {busy ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </div>
  );
}
