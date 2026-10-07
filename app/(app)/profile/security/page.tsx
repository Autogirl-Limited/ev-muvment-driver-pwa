"use client";

import { FormEvent, useState } from "react";
import { useSession } from "next-auth/react";
import { Copy, KeyRound, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { SegmentedControl, TextField } from "../../../components/FormControls";
import { Modal } from "../../../components/Modal";
import { Spinner } from "../../../components/Ui";
import {
  useConfirmTwoFactor,
  useDisableTwoFactor,
  useRequestEmailTwoFactor,
  useSetPreferredTwoFactorMethod,
  useSetupTotp,
  useTwoFactorMethods,
} from "../../../lib/queries";
import type { TotpSetup, TwoFactorMethod, TwoFactorMethodOption } from "../../../lib/types";

const ICONS = { TOTP: Smartphone, EMAIL_OTP: Mail } as const;

const DESCRIPTIONS: Record<TwoFactorMethod, string> = {
  TOTP: "A code from an app like Google Authenticator or Authy.",
  EMAIL_OTP: "A code sent to your email each time you sign in.",
};

type Dialog = { kind: "setup" | "disable"; method: TwoFactorMethod } | null;

/** Status shown under each method, from what the admin offers and what the driver has set up. */
function statusOf(option: TwoFactorMethodOption) {
  if (option.is_enrolled && !option.is_available) return { label: "Paused by your admin", live: false };
  if (option.is_enrolled) return { label: option.is_preferred ? "On · asked first" : "On", live: true };
  if (!option.is_available) return { label: "Not offered", live: false };
  return { label: "Off", live: false };
}

export default function SecurityPage() {
  const email = useSession().data?.profile?.user.email;
  const methods = useTwoFactorMethods();
  const setPreferred = useSetPreferredTwoFactorMethod();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const options = methods.data?.methods ?? [];
  const usable = options.filter((option) => option.is_available && option.is_enrolled);

  return (
    <div className="screen-enter">
      <section className="home">
        <p className="sec-intro">
          Add a second step when you sign in, so your account stays safe even if someone learns your password.
        </p>

        <section className="panel list-panel" aria-busy={methods.isLoading}>
          {methods.isLoading ? (
            <div className="list-row"><Spinner /> <small>Loading your sign-in methods…</small></div>
          ) : methods.isError ? (
            <div className="list-row">
              <div>
                <strong>Couldn’t load your sign-in methods.</strong>
                <button className="link-button" type="button" onClick={() => methods.refetch()}>Try again</button>
              </div>
            </div>
          ) : (
            options.map((option) => {
              const Icon = ICONS[option.method];
              const status = statusOf(option);
              const needsEmail = option.method === "EMAIL_OTP" && !email;
              return (
                <div className="list-row sec-row" key={option.method}>
                  <span className="list-icon"><Icon size={18} /></span>
                  <div>
                    <strong>{option.label}</strong>
                    <small>{needsEmail && !option.is_enrolled ? "Add an email to your account to use this." : DESCRIPTIONS[option.method]}</small>
                    <span className={`pill sec-pill ${status.live ? "pill-live" : ""}`}><i /> {status.label}</span>
                  </div>
                  {option.is_enrolled ? (
                    <button className="sec-action danger" type="button" onClick={() => setDialog({ kind: "disable", method: option.method })}>
                      Turn off
                    </button>
                  ) : option.is_available ? (
                    <button className="sec-action" disabled={needsEmail} type="button" onClick={() => setDialog({ kind: "setup", method: option.method })}>
                      Set up
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </section>

        {methods.data && usable.length > 1 ? (
          <section className="panel">
            <div className="panel-title"><ShieldCheck size={16} /> Ask me first for</div>
            <SegmentedControl
              label="Preferred sign-in method"
              options={usable.map((option) => ({ value: option.method, label: option.method === "TOTP" ? "Authenticator" : "Email code" }))}
              value={methods.data.preferred_method ?? usable[0].method}
              onChange={(method) => {
                if (setPreferred.isPending || method === methods.data?.preferred_method) return;
                setPreferred.mutate(method, {
                  onSuccess: () => toast.success("Saved. We’ll ask for that one first."),
                  onError: (error) => toast.error(error.message),
                });
              }}
            />
            <small className="sec-note">You can always switch to your other method on the sign-in screen.</small>
          </section>
        ) : null}
      </section>

      {dialog?.kind === "setup" && dialog.method === "TOTP" ? <TotpSetupDialog onClose={close} /> : null}
      {dialog?.kind === "setup" && dialog.method === "EMAIL_OTP" ? <EmailSetupDialog email={email ?? ""} onClose={close} /> : null}
      {dialog?.kind === "disable" ? <DisableDialog method={dialog.method} onClose={close} /> : null}
    </div>
  );
}

/** Generates a secret on open, shows it as a QR code, then confirms the first code. */
function TotpSetupDialog({ onClose }: { onClose: () => void }) {
  const setup = useSetupTotp();
  const confirm = useConfirmTwoFactor();
  const [secret, setSecret] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");

  const start = () =>
    setup.mutate(undefined, {
      onSuccess: setSecret,
      onError: (error) => {
        toast.error(error.message);
        onClose();
      },
    });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate(
      { method: "TOTP", code },
      {
        onSuccess: () => {
          toast.success("Authenticator app is on.");
          onClose();
        },
        onError: (error) => {
          setCode("");
          toast.error(error.message);
        },
      },
    );
  }

  const busy = confirm.isPending || confirm.isSuccess;

  return (
    <Modal dismissible={!busy} label="Set up authenticator app" open onClose={onClose}>
      {!secret ? (
        <div className="confirm">
          <span className="confirm-icon"><Smartphone size={26} /></span>
          <h2>Use an authenticator app</h2>
          <p>Install an app like Google Authenticator or Authy, then continue to scan a QR code.</p>
          <div className="confirm-actions">
            <button className="primary-button" disabled={setup.isPending} type="button" onClick={start}>
              {setup.isPending ? <Spinner /> : null} Continue
            </button>
            <button className="ghost-button" disabled={setup.isPending} type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      ) : (
        <form autoComplete="off" className="sec-sheet" onSubmit={handleSubmit}>
          <h2>Scan this code</h2>
          <p>In your authenticator app, add an account and scan the code. Then enter the 6-digit code it shows.</p>
          <div className="sec-qr"><QRCodeSVG size={176} value={secret.otpauth_url} /></div>
          <button
            className="sec-secret"
            type="button"
            onClick={() => navigator.clipboard?.writeText(secret.secret).then(() => toast.success("Key copied."), () => undefined)}
          >
            <span>Can’t scan? Enter this key</span>
            <code>{secret.secret}</code>
            <Copy size={16} />
          </button>
          <TextField autoFocus className="code-field" icon={<ShieldCheck size={18} />} inputMode="numeric" label="6-digit code" maxLength={6} placeholder="123456" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <div className="confirm-actions">
            <button className="primary-button" disabled={busy || code.length !== 6} type="submit">
              {busy ? <Spinner /> : null} Turn on
            </button>
            <button className="ghost-button" disabled={busy} type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Emails a code on request, then confirms it. */
function EmailSetupDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const request = useRequestEmailTwoFactor();
  const confirm = useConfirmTwoFactor();
  const [code, setCode] = useState("");

  const send = () =>
    request.mutate(undefined, {
      onSuccess: () => toast.info("We’ve emailed you a code."),
      onError: (error) => toast.error(error.message),
    });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate(
      { method: "EMAIL_OTP", code },
      {
        onSuccess: () => {
          toast.success("Email codes are on.");
          onClose();
        },
        onError: (error) => {
          setCode("");
          toast.error(error.message);
        },
      },
    );
  }

  const sent = request.isSuccess;
  const busy = confirm.isPending || confirm.isSuccess;

  return (
    <Modal dismissible={!busy} label="Set up email codes" open onClose={onClose}>
      <form autoComplete="off" className="sec-sheet" onSubmit={handleSubmit}>
        <h2>Email codes</h2>
        <p>
          {sent ? <>Enter the 6-digit code we sent to <strong>{email}</strong>.</> : <>We’ll send a code to <strong>{email}</strong> to confirm it’s yours.</>}
        </p>
        {sent ? (
          <TextField autoFocus className="code-field" icon={<ShieldCheck size={18} />} inputMode="numeric" label="6-digit code" maxLength={6} placeholder="123456" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        ) : null}
        <div className="confirm-actions">
          {sent ? (
            <button className="primary-button" disabled={busy || code.length !== 6} type="submit">
              {busy ? <Spinner /> : null} Turn on
            </button>
          ) : (
            <button className="primary-button" disabled={request.isPending} type="button" onClick={send}>
              {request.isPending ? <Spinner /> : null} Send code
            </button>
          )}
          {sent ? (
            <button className="text-button" disabled={request.isPending || busy} type="button" onClick={send}>
              Didn’t get it? <strong>Send again</strong>
            </button>
          ) : null}
          <button className="ghost-button" disabled={busy} type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

/** Turning a method off needs the current password, like on the backend. */
function DisableDialog({ method, onClose }: { method: TwoFactorMethod; onClose: () => void }) {
  const disable = useDisableTwoFactor();
  const [password, setPassword] = useState("");
  const label = method === "TOTP" ? "authenticator app" : "email codes";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    disable.mutate(
      { method, password },
      {
        onSuccess: () => {
          toast.success(`Turned off ${label}.`);
          onClose();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const busy = disable.isPending || disable.isSuccess;

  return (
    <Modal dismissible={!busy} label={`Turn off ${label}`} open onClose={onClose}>
      <form autoComplete="off" className="sec-sheet" onSubmit={handleSubmit}>
        <h2>Turn off {label}?</h2>
        <p>Enter your password to confirm. Your account will be less protected.</p>
        <TextField autoFocus icon={<KeyRound size={18} />} label="Password" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="confirm-actions">
          <button className="primary-button danger" disabled={busy || !password} type="submit">
            {busy ? <Spinner /> : null} Turn off
          </button>
          <button className="ghost-button" disabled={busy} type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
