"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { TextField } from "../components/FormControls";
import { ScreenBar, ScreenTitle, Spinner } from "../components/Ui";
import { useLogin } from "../lib/queries";
import { saveTemporaryPassword } from "../lib/temp-password";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { identifier: identifier.trim(), password },
      {
        onSuccess: (session) => {
          if (session && !session.hasChangedTemporaryPassword) saveTemporaryPassword(password);
          router.replace(session?.hasChangedTemporaryPassword === false ? "/change-password" : "/");
          router.refresh();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const busy = login.isPending || login.isSuccess;

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
