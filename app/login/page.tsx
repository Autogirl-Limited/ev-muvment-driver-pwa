"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck, User } from "lucide-react";
import type { Session } from "next-auth";
import { toast } from "sonner";
import { TextField } from "../components/FormControls";
import { ScreenBar, ScreenTitle, Spinner } from "../components/Ui";
import { api, ApiError } from "../lib/api";
import { useLogin, useSwitchLoginMethod, useVerifyLoginCode } from "../lib/queries";
import { saveTemporaryPassword } from "../lib/temp-password";
import type { LoginChallenge, TwoFactorMethod } from "../lib/types";

const RESEND_COOLDOWN_SECONDS = 60;

const SWITCH_LABELS: Record<TwoFactorMethod, string> = {
  TOTP: "Use my authenticator app",
  EMAIL_OTP: "Email me a code instead",
};

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const verify = useVerifyLoginCode();
  const switchMethod = useSwitchLoginMethod();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function finish(session: Session | null) {
    if (session && !session.hasChangedTemporaryPassword) saveTemporaryPassword(password);
    router.replace(session?.hasChangedTemporaryPassword === false ? "/change-password" : "/");
    router.refresh();
  }

  function backToPassword(message?: string) {
    void api.cancelLoginChallenge();
    setChallenge(null);
    setCode("");
    setPassword("");
    if (message) toast.error(message);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { identifier: identifier.trim(), password },
      {
        onSuccess: (outcome) => {
          if (outcome.status === "signed-in") return finish(outcome.session);
          setChallenge(outcome.challenge);
          if (outcome.challenge.method === "EMAIL_OTP") setCooldown(RESEND_COOLDOWN_SECONDS);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function handleVerify(event: FormEvent) {
    event.preventDefault();
    verify.mutate(code, {
      onSuccess: finish,
      onError: (error) => {
        if (error.message.toLowerCase().includes("expired")) return backToPassword(error.message);
        setCode("");
        toast.error(error.message);
      },
    });
  }

  /** Switches to `method`; picking the current email method resends the code. */
  function chooseMethod(method: TwoFactorMethod) {
    if (!challenge) return;
    const resending = method === challenge.method;
    switchMethod.mutate(method, {
      onSuccess: (next) => {
        setChallenge(next);
        setCode("");
        if (next.method === "EMAIL_OTP") {
          setCooldown(RESEND_COOLDOWN_SECONDS);
          toast.info(resending ? "We’ve sent you a new code." : "We’ve emailed you a code.");
        }
      },
      onError: (error) => (error instanceof ApiError && error.statusCode === 401 ? backToPassword(error.message) : toast.error(error.message)),
    });
  }

  if (challenge) {
    const isTotp = challenge.method === "TOTP";
    const others = challenge.available_methods.filter((method) => method !== challenge.method);
    const busy = verify.isPending || verify.isSuccess;
    const switching = switchMethod.isPending;

    return (
      <div className="screen-enter">
        <ScreenBar />
        <form autoComplete="off" className="form" onSubmit={handleVerify}>
          <ScreenTitle title="Verify it’s you">
            {isTotp ? "Enter the 6-digit code from your authenticator app." : "Enter the 6-digit code we just emailed you."}
          </ScreenTitle>
          <TextField
            autoFocus
            className="code-field"
            icon={<ShieldCheck size={18} />}
            inputMode="numeric"
            label={isTotp ? "Authenticator code" : "Email code"}
            maxLength={6}
            placeholder="123456"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <div className="form-actions">
            <button className="primary-button" disabled={busy || switching || code.length !== 6} type="submit">
              {busy ? <Spinner /> : null}
              {busy ? "Verifying…" : "Verify"}
              {!busy ? <ArrowRight size={18} /> : null}
            </button>
            {!isTotp ? (
              <button className="text-button" disabled={cooldown > 0 || busy || switching} type="button" onClick={() => chooseMethod(challenge.method)}>
                {cooldown ? `Resend code in ${cooldown}s` : <strong>Resend code</strong>}
              </button>
            ) : null}
            {others.map((method) => (
              <button className="text-button" disabled={busy || switching} key={method} type="button" onClick={() => chooseMethod(method)}>
                Can’t use this? <strong>{SWITCH_LABELS[method]}</strong>
              </button>
            ))}
            <button className="text-button" disabled={busy} type="button" onClick={() => backToPassword()}>
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    );
  }

  const busy = login.isPending || (login.isSuccess && login.data.status === "signed-in");

  return (
    <div className="screen-enter">
      <ScreenBar />
      <form autoComplete="off" className="form" onSubmit={handleSubmit}>
        <ScreenTitle title="Welcome back">Sign in to your driver account.</ScreenTitle>
        <TextField autoCapitalize="none" icon={<User size={18} />} label="Username, email or phone" placeholder="chinedu.okafor" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <TextField
          action={<Link className="link-button" href="/forgot-password">Forgot password?</Link>}
          icon={<Lock size={18} />}
          label="Password"
          placeholder="Enter your password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Spinner /> : null}
            {busy ? "Signing in…" : "Sign in"}
            {!busy ? <ArrowRight size={18} /> : null}
          </button>
          <Link className="text-button" href="/apply">
            New driver? <strong>Apply to drive</strong>
          </Link>
        </div>
      </form>
    </div>
  );
}
