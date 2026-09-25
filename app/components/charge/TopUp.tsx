"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, CircleAlert, Clock, Copy, Hourglass, Landmark, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../../lib/api";
import { kwh, naira } from "../../lib/format";
import { useCreateTopup, useTopupPreview, useTopupStatus, useWalletAllocations, useWalletStats } from "../../lib/queries";
import type { WalletAllocation } from "../../lib/types";
import { BankLogo } from "../BankLogo";
import { Spinner } from "../Ui";

const QUICK = [2000, 5000, 10000, 20000];

function useTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function copy(text: string, done: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Couldn't copy. Long-press to copy instead."),
  );
}

const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

/* ---------------------------------------------------------------- */
/* Step 1: how much?                                                 */
/* ---------------------------------------------------------------- */
function AmountEntry({ suggested, onBack, onCreated, onResume }: {
  suggested?: number;
  onBack: () => void;
  onCreated: (allocation: WalletAllocation) => void;
  onResume: (allocation: WalletAllocation) => void;
}) {
  const [text, setText] = useState(suggested ? String(suggested) : "");
  const amount = Number(text.replace(/\D/g, "")) || 0;
  const preview = useTopupPreview(amount);
  const create = useCreateTopup();
  const [error, setError] = useState<string | null>(null);
  const now = useTick(15_000);

  // Never spam the payment provider: point the driver at an open top-up they haven't paid yet.
  const recent = useWalletAllocations(1);
  const open = recent.data?.items.find(
    (a) => a.status === "PENDING_PAYMENT" && (!a.checkout_expires_at || Date.parse(a.checkout_expires_at) > now),
  );

  const chips = suggested && !QUICK.includes(suggested) ? [suggested, ...QUICK] : QUICK;

  return (
    <div className="cl-card">
      <button className="back-link ch-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>
      <div className="cl-step-head">
        <small>Add credit</small>
        <h2>How much do you want to add?</h2>
      </div>

      {open ? (
        <button className="tu-open" type="button" onClick={() => onResume(open)}>
          <Hourglass size={18} />
          <span>
            <b>You have an unpaid top-up of {naira(open.amount)}</b>
            <small>Tap to finish paying it instead of starting a new one</small>
          </span>
        </button>
      ) : null}

      <div className="field">
        <div className="field-top">
          <label htmlFor="topup-amount">Amount (₦)</label>
        </div>
        <div className="field-shell">
          <span className="field-icon tu-naira">₦</span>
          <input
            id="topup-amount"
            inputMode="numeric"
            maxLength={9}
            placeholder="0"
            value={amount ? amount.toLocaleString() : ""}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>

      <div className="ch-chips">
        {chips.map((value) => (
          <button aria-pressed={amount === value} key={value} type="button" onClick={() => setText(String(value))}>
            {value === suggested && !QUICK.includes(value) ? `Just enough · ${naira(value)}` : naira(value)}
          </button>
        ))}
      </div>

      <div className="tu-preview" aria-live="polite">
        {amount < 1 ? (
          <span>Enter an amount to see how much charging it buys.</span>
        ) : preview.isError ? (
          <span>We couldn&apos;t work out the kWh right now, but you can still continue.</span>
        ) : preview.data ? (
          <span>
            <Zap size={14} fill="currentColor" /> ≈ <b>{kwh(preview.data.kwh_equivalent)} kWh</b> at {naira(preview.data.rate_per_kwh)} / kWh
          </span>
        ) : (
          <span>
            <Spinner /> Working it out…
          </span>
        )}
      </div>

      {error ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      ) : null}

      <button
        className="primary-button"
        disabled={amount < 1 || create.isPending}
        type="button"
        onClick={() => {
          setError(null);
          create.mutate(amount, {
            onSuccess: onCreated,
            onError: (e) =>
              setError(
                e instanceof ApiError && e.statusCode === 400
                  ? e.message
                  : "We couldn't set up the payment right now. Nothing was charged. Please try again.",
              ),
          });
        }}
      >
        {create.isPending ? <Spinner /> : <Landmark size={19} />} {create.isPending ? "Setting up…" : "Get account details"}
      </button>

      <ul className="tu-how">
        <li>
          <b>1</b> We give you a one-time bank account
        </li>
        <li>
          <b>2</b> You transfer the exact amount
        </li>
        <li>
          <b>3</b> Your wallet is credited automatically
        </li>
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Step 2: pay, wait, done                                           */
/* ---------------------------------------------------------------- */
function Pay({ allocation: initial, doneLabel, onDone, onRestart, onBack }: {
  allocation: WalletAllocation;
  doneLabel: string;
  onDone: () => void;
  onRestart: () => void;
  onBack: () => void;
}) {
  const query = useTopupStatus(initial.id);
  const allocation = query.data ?? initial;
  const wallet = useWalletStats();
  const now = useTick();

  const expiresAt = allocation.checkout_expires_at ? Date.parse(allocation.checkout_expires_at) : null;
  const left = expiresAt ? expiresAt - now : null;
  const expired = allocation.status === "EXPIRED" || (allocation.status === "PENDING_PAYMENT" && left !== null && left <= 0);

  // Celebrate once, when the credit lands.
  const celebrated = useRef(false);
  useEffect(() => {
    if (allocation.status === "COMPLETED" && !celebrated.current) {
      celebrated.current = true;
      navigator.vibrate?.([80, 60, 80]);
    }
  }, [allocation.status]);

  if (allocation.status === "COMPLETED") {
    return (
      <div className="cl-flow">
        <section className="cl-card cl-done">
          <span className="cl-done-icon">
            <BadgeCheck size={32} />
          </span>
          <h2>{naira(allocation.amount)} added</h2>
          <p>
            Your wallet is now {wallet.data ? <b>{naira(wallet.data.wallet_balance)}</b> : "updated"} · ≈ {kwh(allocation.kwh_equivalent)} kWh bought
          </p>
        </section>
        <button className="primary-button" type="button" onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    );
  }

  if (allocation.status === "AWAITING_ALLOCATION") {
    return (
      <div className="cl-card cl-intro">
        <span className="cl-intro-icon">
          <ShieldCheck size={30} />
        </span>
        <h2>Payment received</h2>
        <p>We&apos;re crediting your wallet now. Your money is safe, and there&apos;s no need to pay again. This screen updates by itself.</p>
        <div className="cl-bar indeterminate tu-wait">
          <span />
        </div>
        <button className="ghost-button" type="button" onClick={onBack}>
          Back to charging
        </button>
      </div>
    );
  }

  if (expired || allocation.status === "CANCELLED") {
    return (
      <div className="cl-card cl-intro">
        <span className="cl-intro-icon tu-bad">
          <Clock size={30} />
        </span>
        <h2>{allocation.status === "CANCELLED" ? "This top-up was cancelled" : "This top-up expired"}</h2>
        <p>Please don&apos;t pay into that account any more. Start a new top-up and we&apos;ll give you a fresh one.</p>
        <button className="primary-button" type="button" onClick={onRestart}>
          Start a new top-up
        </button>
      </div>
    );
  }

  const urgent = left !== null && left < 5 * 60_000;

  return (
    <div className="cl-flow">
      <div className="cl-card tu-pay">
        <button className="back-link ch-back" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="cl-step-head">
          <small>Step 2 of 2</small>
          <h2>Transfer {naira(allocation.amount)}</h2>
        </div>

        <article className="slide slide-blue acct">
          <header className="slide-head">
            <BankLogo name={allocation.checkout_bank_name ?? "Bank"} />
            <span className="slide-chip static">One-time account</span>
          </header>
          <div className="acct-number">
            <small>Account number</small>
            <strong>{spaced(allocation.checkout_account_number ?? "")}</strong>
          </div>
          <div className="slide-foot">
            <span className="slide-bank">
              <small>{allocation.checkout_bank_name}</small>
              <b className="acct-name">{allocation.checkout_account_name}</b>
            </span>
            <button
              aria-label="Copy account number"
              className="slide-copy"
              type="button"
              onClick={() => copy(allocation.checkout_account_number ?? "", "Account number copied.")}
            >
              <Copy size={16} />
            </button>
          </div>
        </article>

        <button className="tu-amount" type="button" onClick={() => copy(String(allocation.amount), "Amount copied.")}>
          <span>
            <small>Send exactly</small>
            <b>{naira(allocation.amount)}</b>
          </span>
          <Copy size={16} />
        </button>

        <div className={`tu-timer ${urgent ? "urgent" : ""}`} role="timer">
          <Clock size={16} />
          {left !== null ? (
            <span>
              Pay within <b>{mmss(left)}</b>
            </span>
          ) : (
            <span>Pay as soon as you can</span>
          )}
        </div>

        <div className="cl-notice">
          <CircleAlert size={16} /> Send the exact amount. Paying less won&apos;t be accepted as a top-up.
        </div>
      </div>

      <div className="tu-waiting" role="status">
        <div className="jr-wait" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <strong>Waiting for your payment…</strong>
        <small>Once the transfer lands, your wallet is credited automatically. You can leave this screen and come back.</small>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Flow                                                              */
/* ---------------------------------------------------------------- */
export function TopUpFlow({ suggested, doneLabel, onBack, onDone }: {
  /** Naira the driver is short by, when they came here from a charge. */
  suggested?: number;
  doneLabel: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [allocation, setAllocation] = useState<WalletAllocation | null>(null);

  if (!allocation) {
    return <AmountEntry suggested={suggested} onBack={onBack} onCreated={setAllocation} onResume={setAllocation} />;
  }
  return <Pay allocation={allocation} doneLabel={doneLabel} onBack={onBack} onDone={onDone} onRestart={() => setAllocation(null)} />;
}

