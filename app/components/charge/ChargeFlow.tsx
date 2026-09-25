"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  BatteryCharging,
  ChevronRight,
  Car,
  Check,
  CircleAlert,
  Hourglass,
  Keyboard,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "../../lib/api";
import { chargeError, isUncertain } from "../../lib/charge-errors";
import { kwh, lagosDate, naira } from "../../lib/format";
import { resolveDateFilter } from "../../lib/date-range";
import {
  CHARGES_PAGE_SIZE,
  CREDITS_PAGE_SIZE,
  useChargeQuote,
  useChargerConnectors,
  useChargeSessions,
  useChargeStats,
  useStartCharge,
  useWalletAllocations,
  useWalletStats,
} from "../../lib/queries";
import { chargerIdFrom } from "../../lib/charger-code";
import type { ChargeQuote, ChargerInfo, ChargeStarted, WalletAllocation } from "../../lib/types";
import { Pagination } from "../Pagination";
import { Spinner } from "../Ui";
import { QrScanner } from "./QrScanner";
import { TopUpFlow } from "./TopUp";

type Step =
  | { k: "home" }
  | { k: "scan" }
  | { k: "connectors"; charger: ChargerInfo }
  | { k: "plug"; charger: ChargerInfo; connectorId: string }
  | { k: "amount"; charger: ChargerInfo; connectorId: string; quote: ChargeQuote; quotedAt: number }
  | { k: "topup"; suggested?: number; back: Step }
  | { k: "done"; result: ChargeStarted; chargerId: string; connectorId: string };

const STALE_QUOTE_MS = 3 * 60_000;

/** Ticks every 15s so "expires soon" banners drop off by themselves. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function Back({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button className="back-link ch-back" type="button" onClick={onClick}>
      <ArrowLeft size={18} /> {label}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Home: wallet, two clear actions, history                          */
/* ---------------------------------------------------------------- */
const CREDIT_STATUS: Record<WalletAllocation["status"], { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warn" },
  AWAITING_ALLOCATION: { label: "Crediting", tone: "idle" },
  COMPLETED: { label: "Added", tone: "ok" },
  EXPIRED: { label: "Expired", tone: "idle" },
  CANCELLED: { label: "Cancelled", tone: "idle" },
};

function History() {
  const [tab, setTab] = useState<"charges" | "credits">("charges");
  const [chargePage, setChargePage] = useState(1);
  const [creditPage, setCreditPage] = useState(1);
  const charges = useChargeSessions(chargePage);
  const credits = useWalletAllocations(creditPage);
  const list = tab === "charges" ? charges : credits;

  return (
    <section className="tx" aria-label="Wallet activity">
      <div className="nt-tabs" role="tablist">
        <button aria-selected={tab === "charges"} role="tab" type="button" onClick={() => setTab("charges")}>
          Charges
        </button>
        <button aria-selected={tab === "credits"} role="tab" type="button" onClick={() => setTab("credits")}>
          Credit added
        </button>
      </div>

      {list.isPending ? (
        <ul className="tx-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li className="tx-skeleton" key={i} />
          ))}
        </ul>
      ) : list.isError ? (
        <div className="panel">
          <p className="empty">
            <CircleAlert size={18} /> Couldn&apos;t load this list.
          </p>
          <button className="ghost-button" type="button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </div>
      ) : !list.data?.items.length ? (
        <div className="panel">
          <p className="empty">
            <BatteryCharging size={18} /> {tab === "charges" ? "No charges yet. Your first one will show up here." : "No credit added yet."}
          </p>
        </div>
      ) : (
        <div className={`tx-body ${list.isPlaceholderData ? "loading" : ""}`}>
          <ul className="tx-list">
            {tab === "charges"
              ? charges.data?.items.map((s) => (
                  <li className="tx-row static" key={s.id}>
                    <span className="tx-avatar ch-bolt">
                      <Zap size={17} />
                    </span>
                    <span className="tx-main">
                      <strong>{s.charger_id.split("/").pop() ?? s.charger_id} · Plug {s.connector_id}</strong>
                      <small>{when(s.created_at)}</small>
                    </span>
                    <span className="tx-side">
                      <b className="out">−{naira(s.amount)}</b>
                      <small>{s.energy_kwh != null ? `≈ ${s.energy_kwh.toFixed(2)} kWh` : "—"}</small>
                    </span>
                  </li>
                ))
              : credits.data?.items.map((a) => {
                  const status = CREDIT_STATUS[a.status];
                  return (
                    <li className="tx-row static" key={a.id}>
                      <span className="tx-avatar">
                        <Wallet size={17} />
                      </span>
                      <span className="tx-main">
                        <strong>{a.type === "FREE_GRANT" ? "Free credit from EV Muvment" : "Wallet top-up"}</strong>
                        <small>{when(a.created_at)}</small>
                      </span>
                      <span className="tx-side">
                        <b className={a.status === "COMPLETED" ? "" : "out"}>{a.status === "COMPLETED" ? "+" : ""}{naira(a.amount)}</b>
                        <small className={`cl-tag ${status.tone}`}>{status.label}</small>
                      </span>
                    </li>
                  );
                })}
          </ul>
          <Pagination
            busy={list.isFetching}
            page={list.data.pagination.page}
            pageSize={tab === "charges" ? CHARGES_PAGE_SIZE : CREDITS_PAGE_SIZE}
            totalItems={list.data.pagination.total_items}
            totalPages={list.data.pagination.total_pages}
            onPage={tab === "charges" ? setChargePage : setCreditPage}
          />
        </div>
      )}
    </section>
  );
}

function Home({ hasVehicle, onScan, onTopup }: { hasVehicle: boolean; onScan: () => void; onTopup: () => void }) {
  const { data: session } = useSession();
  const wallet = useWalletStats();
  const month = useChargeStats(resolveDateFilter({ preset: "month" }, lagosDate()));
  const recent = useWalletAllocations(1);
  const now = useNow();
  const balance = wallet.data?.wallet_balance ?? session?.profile?.user.ev_wallet_balance ?? 0;
  const empty = balance <= 0;

  const openTopup = recent.data?.items.find(
    (a) => a.status === "PENDING_PAYMENT" && (!a.checkout_expires_at || Date.parse(a.checkout_expires_at) > now),
  );
  const crediting = recent.data?.items.find((a) => a.status === "AWAITING_ALLOCATION");

  return (
    <>
      <section className="ch-hero">
        <header>
          <span>
            <Wallet size={15} /> EV wallet
          </span>
          {wallet.data ? (
            <span className="ch-rate">
              <Zap size={12} fill="currentColor" /> {naira(wallet.data.current_rate_per_kwh)} / kWh
            </span>
          ) : null}
        </header>
        <strong className="ch-balance">{naira(balance)}</strong>
        <p>{wallet.data ? <>Enough for about <b>{kwh(wallet.data.wallet_balance_kwh)} kWh</b> of charging</> : "Loading your balance…"}</p>

        <div className="ch-actions">
          <button className={empty ? "ch-btn alt" : "ch-btn"} disabled={!hasVehicle} type="button" onClick={onScan}>
            <QrCode size={20} /> Charge my car
          </button>
          <button className={empty ? "ch-btn" : "ch-btn alt"} disabled={!hasVehicle} type="button" onClick={onTopup}>
            <Plus size={20} /> Add credit
          </button>
        </div>
        {empty && hasVehicle ? <small className="ch-hint">Your wallet is empty. Add credit to start charging.</small> : null}
      </section>

      {openTopup ? (
        <button className="tu-open" type="button" onClick={onTopup}>
          <Hourglass size={18} />
          <span>
            <b>Finish your {naira(openTopup.amount)} top-up</b>
            <small>Waiting for your bank transfer. Tap to see the account details.</small>
          </span>
        </button>
      ) : crediting ? (
        <div className="tu-open static">
          <ShieldCheck size={18} />
          <span>
            <b>Payment received: {naira(crediting.amount)}</b>
            <small>We&apos;re crediting your wallet. No need to pay again.</small>
          </span>
        </div>
      ) : null}

      {!hasVehicle ? (
        <div className="cl-notice">
          <Car size={16} /> You can charge and add credit once an admin assigns you a vehicle. We&apos;ll let you know.
        </div>
      ) : (
        <ol className="ch-how" aria-label="How charging works">
          <li>
            <b>1</b> Scan the charger
          </li>
          <li>
            <b>2</b> Pick a plug
          </li>
          <li>
            <b>3</b> Pay &amp; charge
          </li>
        </ol>
      )}

      <div className="stat-row">
        <div className="stat">
          <span>Spent this month</span>
          <strong>{month.data ? naira(month.data.total_amount_spent) : "—"}</strong>
        </div>
        <div className="stat">
          <span>Charges</span>
          <strong>{month.data?.session_count ?? "—"}</strong>
        </div>
      </div>

      <History />
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Scan the QR (or type the id)                                      */
/* ---------------------------------------------------------------- */
function Scan({ busy, error, onCharger, onBack }: { busy: boolean; error: string | null; onCharger: (id: string) => void; onBack: () => void }) {
  const [manual, setManual] = useState("");
  const [cameraFailed, setCameraFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const id = manual.trim();

  // The QR holds a LotGrids link (…?charge=<charger id>); a typed id or a pasted link both work.
  const submit = (text: string) => {
    const chargerId = chargerIdFrom(text);
    if (!chargerId) {
      setCodeError("That QR code isn't for a charger. Scan the code on the charger itself.");
      setAttempt((n) => n + 1); // restart the camera so they can try again
      return;
    }
    setCodeError(null);
    onCharger(chargerId);
  };

  // A failed lookup restarts the camera so the driver can simply point at the code again.
  const lastError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== lastError.current) setAttempt((n) => n + 1);
    lastError.current = error;
  }, [error]);

  return (
    <div className="cl-card ch-scanview">
      <Back onClick={onBack} />
      <div className="cl-step-head">
        <small>Step 1</small>
        <h2>Scan the charger</h2>
      </div>

      <div className="qr-wrap">
        {busy ? (
          <div className="qr qr-off">
            <Spinner />
            <span>Finding your charger…</span>
          </div>
        ) : (
          <QrScanner key={attempt} onError={setCameraFailed} onScan={submit} />
        )}
      </div>

      {error || codeError ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {error ?? codeError}
        </div>
      ) : cameraFailed ? (
        <div className="cl-notice">
          <CircleAlert size={16} /> {cameraFailed}
        </div>
      ) : (
        <p className="cl-tip">Point your camera at the QR code on the charger. It scans automatically.</p>
      )}

      {showManual || cameraFailed ? (
        <form
          className="ch-manual"
          onSubmit={(event) => {
            event.preventDefault();
            if (id) submit(id);
          }}
        >
          <div className="field">
            <div className="field-top">
              <label htmlFor="charger-id">Charger code or link</label>
            </div>
            <div className="field-shell">
              <input
                autoCapitalize="characters"
                id="charger-id"
                maxLength={200}
                placeholder="e.g. CHG-LAG-0042"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
            </div>
          </div>
          <button className="primary-button" disabled={!id || busy} type="submit">
            Continue
          </button>
        </form>
      ) : (
        <button className="ghost-button" type="button" onClick={() => setShowManual(true)}>
          <Keyboard size={18} /> Enter charger code instead
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pick a plug                                                       */
/* ---------------------------------------------------------------- */
function Connectors({
  charger,
  refreshing,
  notice,
  onRefresh,
  onPick,
  onBack,
}: {
  charger: ChargerInfo;
  refreshing: boolean;
  notice: string | null;
  onRefresh: () => void;
  onPick: (connectorId: string) => void;
  onBack: () => void;
}) {
  const free = charger.connectors.filter((c) => c.available).length;
  const meta = [charger.connector_type, charger.power_kw != null ? `${charger.power_kw} kW` : null].filter(Boolean).join(" · ");

  return (
    <div className="cl-card">
      <Back onClick={onBack} label="Scan again" />
      <div className="cl-step-head">
        <small>Step 2</small>
        <h2>Choose a plug</h2>
      </div>

      <div className="ch-site">
        <span className="tb-icon">
          <Zap size={18} />
        </span>
        <div>
          <strong>{charger.location_name ?? charger.charger_id}</strong>
          <small>{[meta, charger.charger_id].filter(Boolean).join(" · ")}</small>
        </div>
      </div>

      {notice ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {notice}
        </div>
      ) : null}

      {free === 0 ? <div className="cl-notice">All connectors are in use right now. Wait a moment, then refresh.</div> : null}

      <ul className="ch-plugs">
        {charger.connectors.map((c) => (
          <li key={c.connector_id}>
            <button className={c.available ? "free" : ""} disabled={!c.available} type="button" onClick={() => onPick(c.connector_id)}>
              <span className="ch-plug-icon">
                <Plug size={22} />
              </span>
              <span className="ch-plug-info">
                <strong>Plug {c.connector_id}</strong>
                <small>{[charger.connector_type, charger.power_kw != null ? `${charger.power_kw} kW` : null].filter(Boolean).join(" · ") || "Connector"}</small>
              </span>
              <span className="ch-plug-status">{c.available ? "Free" : "In use"}</span>
              {c.available ? <ChevronRight size={18} className="ch-plug-go" /> : null}
            </button>
          </li>
        ))}
      </ul>

      <button className="ghost-button" disabled={refreshing} type="button" onClick={onRefresh}>
        {refreshing ? <Spinner /> : <RefreshCw size={18} />} Refresh availability
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Plug in, then price                                               */
/* ---------------------------------------------------------------- */
function PlugIn({
  charger,
  connectorId,
  pending,
  error,
  onQuote,
  onBack,
}: {
  charger: ChargerInfo;
  connectorId: string;
  pending: boolean;
  error: string | null;
  onQuote: () => void;
  onBack: () => void;
}) {
  return (
    <div className="cl-card cl-intro">
      <Back onClick={onBack} />
      <span className="cl-intro-icon">
        <Plug size={30} />
      </span>
      <h2>Plug in your car</h2>
      <p>
        Connect your vehicle to <b>Plug {connectorId}</b> at {charger.location_name ?? charger.charger_id}. We price the charge for the car that&apos;s connected, so
        plug in before you continue.
      </p>
      {error ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      ) : null}
      <button className="primary-button" disabled={pending} type="button" onClick={onQuote}>
        {pending ? <Spinner /> : <Check size={19} />} {pending ? "Checking the price…" : "I've plugged in, show price"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Choose the amount and start                                       */
/* ---------------------------------------------------------------- */
function AmountStep({
  charger,
  connectorId,
  quote,
  quotedAt,
  ratePerKwh,
  onRequote,
  requoting,
  onStarted,
  onTopup,
  onBack,
}: {
  charger: ChargerInfo;
  connectorId: string;
  quote: ChargeQuote;
  quotedAt: number;
  ratePerKwh: number | null;
  onRequote: () => void;
  requoting: boolean;
  onStarted: (result: ChargeStarted) => void;
  /** Opens the top-up flow, suggesting how much is missing. */
  onTopup: (suggested: number) => void;
  onBack: () => void;
}) {
  const start = useStartCharge();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const sent = useRef(false); // a second tap can never send a second debit

  const full = quote.quoted_amount;
  const balance = quote.sub_wallet_balance;
  const max = Math.min(full, balance);
  const canFull = balance >= full;
  const [amount, setAmount] = useState(max);

  // A quote isn't a reservation: after a few minutes ask for a fresh price.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const stale = now - quotedAt > STALE_QUOTE_MS;

  const chips = useMemo(() => {
    if (max < 1) return [];
    const round = (share: number) => Math.max(1, Math.min(max, Math.round((max * share) / 50) * 50 || 1));
    return [...new Set([round(0.25), round(0.5), round(0.75), max])];
  }, [max]);

  const submit = async () => {
    if (sent.current) return;
    sent.current = true;
    setError(null);
    try {
      const result = await start.mutateAsync({ chargerId: charger.charger_id, connectorId, amount });
      onStarted(result);
    } catch (e) {
      if (isUncertain(e)) {
        // The answer may have been lost on the way back. Look before ever retrying.
        setChecking(true);
        try {
          const latest = (await api.chargeSessions(1, 1)).items[0];
          if (latest && latest.amount === amount && Date.now() - Date.parse(latest.created_at) < 3 * 60_000) {
            onStarted({ session_id: latest.lotgrids_session_id ?? "", debited: latest.amount, remaining_balance: latest.remaining_balance ?? balance - latest.amount });
            return;
          }
          setError(`${chargeError(e)} Nothing was charged.`);
        } catch {
          setError("We couldn't confirm whether the charge started. Check your recent charges before trying again.");
        } finally {
          setChecking(false);
        }
      } else {
        setError(chargeError(e));
      }
      sent.current = false;
    }
  };

  const busy = start.isPending || checking;
  const soc = Math.max(0, Math.min(100, quote.soc_percent ?? 0));

  return (
    <div className="cl-card ch-amount">
      <Back onClick={onBack} label="Change plug" />
      <div className="cl-step-head">
        <small>Step 3</small>
        <h2>Choose how much</h2>
      </div>

      <div className="ch-car">
        <div className="ch-soc" style={{ ["--soc" as string]: `${soc}%` }} aria-label={`Battery ${soc}%`}>
          <b>{quote.soc_percent != null ? `${soc}%` : "—"}</b>
          <small>battery</small>
        </div>
        <div>
          <strong>{quote.vehicle_model ?? "Your vehicle"}</strong>
          <small>
            Plug {connectorId} · {charger.location_name ?? charger.charger_id}
          </small>
        </div>
      </div>

      <dl className="ch-lines">
        <div>
          <dt>Full charge</dt>
          <dd>{naira(full)}</dd>
        </div>
        <div>
          <dt>Your wallet</dt>
          <dd className={canFull ? "" : "low"}>{naira(balance)}</dd>
        </div>
      </dl>

      {max < 1 ? (
        <div className="cl-notice bad">
          <Wallet size={16} /> Your wallet is empty. Add credit first, then come back to charge.
        </div>
      ) : (
        <>
          <div className="ch-pick">
            <strong className="ch-pick-amount">{naira(amount)}</strong>
            <small>
              {amount === full ? "Full charge" : "Partial charge"}
              {ratePerKwh ? ` · ≈ ${kwh(amount / ratePerKwh)} kWh` : ""}
            </small>
          </div>

          {max > 1 ? (
            <input
              aria-label="Amount to charge"
              className="ch-range"
              max={max}
              min={Math.min(max, 100)}
              step={1}
              style={{ ["--fill" as string]: `${((amount - Math.min(max, 100)) / Math.max(1, max - Math.min(max, 100))) * 100}%` }}
              type="range"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          ) : null}

          <div className="ch-chips">
            {chips.map((value) => (
              <button aria-pressed={amount === value} key={value} type="button" onClick={() => setAmount(value)}>
                {value === full ? "Full" : value === max ? "Max" : naira(value)}
              </button>
            ))}
          </div>

          {!canFull ? (
            <div className="cl-notice">
              <Wallet size={16} /> Your wallet is {naira(full - balance)} short of a full charge. Charge what you can, or{" "}
              <button className="ch-inline" type="button" onClick={() => onTopup(full - balance)}>
                add {naira(full - balance)} credit
              </button>{" "}
              first.
            </div>
          ) : null}
        </>
      )}

      {stale ? (
        <div className="cl-notice">
          <RefreshCw size={16} /> This price is a few minutes old. Refresh it before you start.
        </div>
      ) : null}

      {error ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      ) : null}

      {max < 1 ? (
        <button className="primary-button" type="button" onClick={() => onTopup(full)}>
          <Wallet size={19} /> Add credit
        </button>
      ) : stale ? (
        <button className="primary-button" disabled={requoting} type="button" onClick={onRequote}>
          {requoting ? <Spinner /> : <RefreshCw size={19} />} Refresh price
        </button>
      ) : (
        <button className="primary-button" disabled={busy || amount < 1} type="button" onClick={() => void submit()}>
          {busy ? <Spinner /> : <Zap size={19} fill="currentColor" />}{" "}
          {checking ? "Confirming…" : busy ? "Starting…" : `Pay ${naira(amount)} & start charging`}
        </button>
      )}
      <small className="cl-fine">The amount is taken from your wallet. If the charger delivers less, the difference is refunded automatically.</small>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Started                                                           */
/* ---------------------------------------------------------------- */
function Done({ result, onDone }: { result: ChargeStarted; onDone: () => void }) {
  return (
    <div className="cl-flow">
      <section className="cl-card cl-done">
        <span className="cl-done-icon">
          <Zap size={30} fill="currentColor" />
        </span>
        <h2>Charging started</h2>
        <p>Your car will begin charging in a moment.</p>
      </section>

      <section className="cl-card">
        <dl className="ch-lines">
          <div>
            <dt>Taken from wallet</dt>
            <dd>{naira(result.debited)}</dd>
          </div>
          <div>
            <dt>Wallet balance</dt>
            <dd>{naira(result.remaining_balance)}</dd>
          </div>
          {result.session_id ? (
            <div>
              <dt>Session</dt>
              <dd className="ch-session">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(result.session_id).then(
                      () => toast.success("Session ID copied."),
                      () => toast.error("Couldn't copy."),
                    )
                  }
                >
                  {result.session_id}
                </button>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="cl-tip">If the charger delivers less than you paid for, the difference goes back to your wallet automatically. Keep the session ID for support.</p>
      </section>

      <button className="primary-button" type="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Orchestrator                                                      */
/* ---------------------------------------------------------------- */
export function ChargeFlow() {
  const { data: session } = useSession();
  const profile = session?.profile;
  const hasVehicle = Boolean(profile?.vehicle ?? profile?.user.vehicle);
  const wallet = useWalletStats();
  const [step, setStep] = useState<Step>({ k: "home" });
  const [error, setError] = useState<string | null>(null);
  const connectors = useChargerConnectors();
  const quoteMutation = useChargeQuote();

  const go = (next: Step) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const loadCharger = (chargerId: string) => {
    setError(null);
    connectors.mutate(chargerId.trim(), {
      onSuccess: (charger) => go({ k: "connectors", charger }),
      onError: (e) => setError(chargeError(e)),
    });
  };

  if (step.k === "home") return <Home hasVehicle={hasVehicle} onScan={() => go({ k: "scan" })} onTopup={() => go({ k: "topup", back: { k: "home" } })} />;

  if (step.k === "topup") {
    const { back } = step;
    return (
      <TopUpFlow
        doneLabel={back.k === "home" ? "Done" : "Continue to charging"}
        suggested={step.suggested}
        onBack={() => go(back)}
        // The balance changed, so a charge in progress needs a fresh price before it can start.
        onDone={() => go(back.k === "amount" ? { k: "plug", charger: back.charger, connectorId: back.connectorId } : back)}
      />
    );
  }

  if (step.k === "scan")
    return <Scan busy={connectors.isPending} error={error} onBack={() => go({ k: "home" })} onCharger={loadCharger} />;

  if (step.k === "connectors")
    return (
      <Connectors
        charger={step.charger}
        notice={error}
        refreshing={connectors.isPending}
        onBack={() => go({ k: "scan" })}
        onPick={(connectorId) => go({ k: "plug", charger: step.charger, connectorId })}
        onRefresh={() => {
          setError(null);
          connectors.mutate(step.charger.charger_id, {
            onSuccess: (charger) => setStep({ k: "connectors", charger }),
            onError: (e) => setError(chargeError(e)),
          });
        }}
      />
    );

  const quote = (charger: ChargerInfo, connectorId: string) => {
    setError(null);
    quoteMutation.mutate(
      { chargerId: charger.charger_id, connectorId },
      {
        onSuccess: (result) => go({ k: "amount", charger, connectorId, quote: result, quotedAt: Date.now() }),
        onError: (e) => {
          const message = chargeError(e);
          if (e instanceof ApiError && e.statusCode === 409) {
            // Someone else got the plug: show the fresh availability.
            connectors.mutate(charger.charger_id, {
              onSuccess: (fresh) => {
                setStep({ k: "connectors", charger: fresh });
                setError(message);
              },
              onError: () => setError(message),
            });
          } else setError(message);
        },
      },
    );
  };

  if (step.k === "plug")
    return (
      <PlugIn
        charger={step.charger}
        connectorId={step.connectorId}
        error={error}
        pending={quoteMutation.isPending}
        onBack={() => go({ k: "connectors", charger: step.charger })}
        onQuote={() => quote(step.charger, step.connectorId)}
      />
    );

  if (step.k === "amount")
    return (
      <AmountStep
        // A fresh quote resets the amount to the new maximum.
        key={step.quotedAt}
        charger={step.charger}
        connectorId={step.connectorId}
        quote={step.quote}
        quotedAt={step.quotedAt}
        ratePerKwh={wallet.data?.current_rate_per_kwh ?? null}
        requoting={quoteMutation.isPending}
        onBack={() => go({ k: "connectors", charger: step.charger })}
        onRequote={() => quote(step.charger, step.connectorId)}
        onStarted={(result) => go({ k: "done", result, chargerId: step.charger.charger_id, connectorId: step.connectorId })}
        onTopup={(suggested) => go({ k: "topup", suggested, back: step })}
      />
    );

  if (step.k !== "done") return null;
  return <Done result={step.result} onDone={() => go({ k: "home" })} />;
}
