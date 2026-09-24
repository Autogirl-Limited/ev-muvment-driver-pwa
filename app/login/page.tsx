"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, User } from "lucide-react";
import { TextField } from "../components/FormControls";
import { Toast, useNotice } from "../components/Toast";
import { ScreenBar, ScreenTitle, Spinner } from "../components/Ui";
import { ApiError, getSession, login, saveTemporaryPassword } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [notice, setNotice] = useNotice();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace("/");
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const session = await login(identifier, password);
      if (!session.has_changed_temporary_password) {
        saveTemporaryPassword(password);
        router.push("/change-password");
      } else {
        router.push("/");
      }
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
        <ScreenTitle title="Welcome back">Sign in to your driver account.</ScreenTitle>
        <TextField autoCapitalize="none" autoComplete="username" icon={<User size={18} />} label="Username, email or phone" placeholder="chinedu.okafor" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <TextField
          action={<Link className="link-button" href="/forgot-password">Forgot password?</Link>}
          autoComplete="current-password"
          icon={<Lock size={18} />}
          label="Password"
          placeholder="Enter your password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="form-actions">
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? <Spinner /> : null}
            {loading ? "Signing in…" : "Sign in"}
            {!loading ? <ArrowRight size={18} /> : null}
          </button>
          <Link className="text-button" href="/apply">
            New driver? <strong>Apply to drive</strong>
          </Link>
        </div>
      </form>
    </div>
  );
}
