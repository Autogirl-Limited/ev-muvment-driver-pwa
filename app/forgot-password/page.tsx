"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, User } from "lucide-react";
import { TextField } from "../components/FormControls";
import { Toast, useNotice } from "../components/Toast";
import { ScreenBar, ScreenTitle, Spinner, StrengthMeter } from "../components/Ui";
import { ApiError, forgotPassword, resetPassword, setFlash } from "../lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [notice, setNotice] = useNotice();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const fail = (error: unknown) =>
    setNotice({ text: error instanceof ApiError ? error.message : "Something went wrong. Please try again.", tone: "error" });

  async function handleRequest(event: FormEvent | { preventDefault: () => void }) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      await forgotPassword(identifier, "SMS");
      setSent(true);
      setCooldown(60);
      setNotice({ text: "If that account exists, we have sent a reset code.", tone: "info" });
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      await resetPassword(identifier, code, newPassword);
      setFlash({ text: "Password reset. Sign in with your new password.", tone: "success" });
      router.push("/login");
    } catch (error) {
      fail(error);
      setLoading(false);
    }
  }

  return (
    <div className="screen-enter">
      <ScreenBar backHref="/login" backLabel="Sign in" />
      <Toast notice={notice} onClose={() => setNotice(null)} />
      <form className="form" onSubmit={sent ? handleReset : handleRequest}>
        <ScreenTitle title={sent ? "Enter your reset code" : "Reset your password"}>
          {sent ? "We texted you a code. Enter it below with your new password." : "Enter your account details and we’ll text you a one-time code."}
        </ScreenTitle>
        <TextField autoCapitalize="none" autoComplete="username" icon={<User size={18} />} label="Username, email or phone" placeholder="chinedu.okafor" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        {sent ? (
          <>
            <TextField autoComplete="one-time-code" className="code-field" icon={<ShieldCheck size={18} />} inputMode="numeric" label="Verification code" maxLength={10} placeholder="123456" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <div className="stack-tight">
              <TextField autoComplete="new-password" icon={<KeyRound size={18} />} label="New password" minLength={8} placeholder="At least 8 characters" required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <StrengthMeter value={newPassword} />
            </div>
          </>
        ) : null}
        <div className="form-actions">
          <button className="primary-button" disabled={loading || Boolean(cooldown && !sent)} type="submit">
            {loading ? <Spinner /> : null}
            {sent ? "Reset password" : cooldown ? `Resend in ${cooldown}s` : "Send reset code"}
          </button>
          {sent ? (
            <button className="text-button" disabled={cooldown > 0 || loading} type="button" onClick={handleRequest}>
              {cooldown ? `Resend code in ${cooldown}s` : <strong>Resend code</strong>}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
