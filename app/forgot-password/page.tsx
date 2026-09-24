"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { TextField } from "../components/FormControls";
import { ScreenBar, ScreenTitle, Spinner, StrengthMeter } from "../components/Ui";
import { useForgotPassword, useResetPassword } from "../lib/queries";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const forgot = useForgotPassword();
  const reset = useResetPassword();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const requestCode = () =>
    forgot.mutate(
      { identifier },
      {
        onSuccess: () => {
          setSent(true);
          setCooldown(60);
          toast.info("If that account exists, we have sent a reset code.");
        },
        onError: (error) => toast.error(error.message),
      },
    );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sent) return requestCode();
    reset.mutate(
      { identifier, code, newPassword },
      {
        onSuccess: () => {
          toast.success("Password reset. Sign in with your new password.");
          router.push("/login");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const busy = forgot.isPending || reset.isPending || reset.isSuccess;

  return (
    <div className="screen-enter">
      <ScreenBar backHref="/login" backLabel="Sign in" />
      <form autoComplete="off" className="form" onSubmit={handleSubmit}>
        <ScreenTitle title={sent ? "Enter your reset code" : "Reset your password"}>
          {sent ? "We texted you a code. Enter it below with your new password." : "Enter your account details and we’ll text you a one-time code."}
        </ScreenTitle>
        <TextField autoCapitalize="none" icon={<User size={18} />} label="Username, email or phone" placeholder="chinedu.okafor" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        {sent ? (
          <>
            <TextField className="code-field" icon={<ShieldCheck size={18} />} inputMode="numeric" label="Verification code" maxLength={10} placeholder="123456" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <div className="stack-tight">
              <TextField icon={<KeyRound size={18} />} label="New password" minLength={8} placeholder="At least 8 characters" required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <StrengthMeter value={newPassword} />
            </div>
          </>
        ) : null}
        <div className="form-actions">
          <button className="primary-button" disabled={busy || Boolean(cooldown && !sent)} type="submit">
            {busy ? <Spinner /> : null}
            {sent ? "Reset password" : cooldown ? `Resend in ${cooldown}s` : "Send reset code"}
          </button>
          {sent ? (
            <button className="text-button" disabled={cooldown > 0 || busy} type="button" onClick={requestCode}>
              {cooldown ? `Resend code in ${cooldown}s` : <strong>Resend code</strong>}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
