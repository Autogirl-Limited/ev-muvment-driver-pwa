"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { TextField } from "../components/FormControls";
import { Toast, useNotice } from "../components/Toast";
import { ScreenBar, ScreenTitle, Spinner, StrengthMeter } from "../components/Ui";
import { ApiError, changePassword, clearTemporaryPassword, getSession, getTemporaryPassword, saveSession, setFlash } from "../lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [notice, setNotice] = useNotice();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getSession();
      if (!session) router.replace("/login");
      else if (session.has_changed_temporary_password) router.replace("/");
      else setCurrentPassword(getTemporaryPassword());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      await changePassword(session.access_token, currentPassword, newPassword);
      saveSession({ ...session, has_changed_temporary_password: true });
      clearTemporaryPassword();
      setFlash({ text: "Password changed successfully.", tone: "success" });
      router.push("/");
    } catch (error) {
      setNotice({ text: error instanceof ApiError ? error.message : "Something went wrong. Please try again.", tone: "error" });
      setLoading(false);
    }
  }

  return (
    <div className="screen-enter">
      <ScreenBar />
      <Toast notice={notice} onClose={() => setNotice(null)} />
      <form className="form" onSubmit={handleSubmit}>
        <ScreenTitle title="Set your own password">Your temporary password is already filled in, so this only takes a moment.</ScreenTitle>
        <TextField autoComplete="current-password" icon={<Lock size={18} />} label="Temporary password" placeholder="Temporary password" required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <div className="stack-tight">
          <TextField autoComplete="new-password" icon={<KeyRound size={18} />} label="New password" minLength={8} placeholder="At least 8 characters" required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <StrengthMeter value={newPassword} />
        </div>
        <div className="form-actions">
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? <Spinner /> : null}
            {loading ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </div>
  );
}
