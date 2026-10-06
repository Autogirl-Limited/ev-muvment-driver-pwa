"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { api } from "../../lib/api";
import { chargeError, confirmError, isStatus, isUncertain } from "../../lib/charge-errors";
import { kwh, lagosDate, naira } from "../../lib/format";
import { resolveDateFilter } from "../../lib/date-range";
import {
  CHARGES_PAGE_SIZE,
  CREDITS_PAGE_SIZE,
  isCharging,
  isOperatorPriced,
  useChargeQuote,
  useChargerConnectors,
  useChargeSessions,
  useChargeStats,
  useConfirmCharge,
  useLiveChargeSession,
  useManualChargeSession,
  useStartCharge,
  useWalletAllocations,
  useWalletStats,
  type ManualQuoteCache,
} from "../../lib/queries";
import { chargerIdFrom } from "../../lib/charger-code";
import type { ChargeQuote, ChargerInfo, ChargeSession, ChargeSessionStatus, ChargeStarted, WalletAllocation } from "../../lib/types";
import { Pagination } from "../Pagination";
import { Spinner } from "../Ui";
import { QrScanner } from "./QrScanner";
import { TopUpFlow } from "./TopUp";

type Step =
  | { k: "home" }
  | { k: "scan" }
  | { k: "connectors"; charger: ChargerInfo }
  | { k: "plug"; charger: ChargerInfo; connectorId: string }
  | { k: "amount"; charger: ChargerInfo; connectorId: string; quote: ChargeQuote; quotedAt: number; notice?: string }
  | { k: "operator"; charger: ChargerInfo; connectorId: string; sessionId: string; balance: number }
  | { k: "topup"; suggested?: number; back: Step }
  | { k: "done"; result: ChargeStarted; charger: ChargerInfo; connectorId: string; startedAt: number; manual?: boolean };

const STALE_QUOTE_MS = 3 * 60_000;
/** A row still marked STARTED after this long is almost certainly stuck; don't advertise it as live. */
const LIVE_WINDOW_MS = 12 * 60 * 60_000;
const NO_VEHICLE = "You can't charge yet because you don't have a vehicle assigned to you. Once an admin assigns you a vehicle, you'll be able to charge.";

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

const CHARGE_STATUS: Record<ChargeSessionStatus, { label: string; tone: string }> = {
  STARTED: { label: "Charging", tone: "live" },
  COMPLETED: { label: "Completed", tone: "ok" },
  INTERRUPTED: { label: "Stopped early", tone: "warn" },
};

const chargerName = (id: string) => id.split("/").pop() || id;

function ChargeRow({ s }: { s: ChargeSession }) {
  const status = s.status ? CHARGE_STATUS[s.status] : null;
  const refund = s.refund_amount ?? 0;
  return (
    <li className="tx-row static">
      <span className="tx-avatar ch-bolt">
        <Zap size={17} />
      </span>
      <span className="tx-main">
        <strong>
          {chargerName(s.charger_id)} · Plug {s.connector_id}
        </strong>
        <small>
          {when(s.created_at)}
          {status ? (
            <>
              {" · "}
              <span className={`ch-state ${status.tone}`}>{status.label}</span>
            </>
          ) : null}
        </small>
      </span>
      <span className="tx-side">
        <b className="out">−{naira(s.amount)}</b>
        {refund > 0 ? (
          <small className="ch-refund">+{naira(refund)} refunded</small>
        ) : (
          <small>{s.energy_kwh != null ? `≈ ${s.energy_kwh.toFixed(2)} kWh` : "—"}</small>
        )}
      </span>
    </li>
  );
}

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
              ? charges.data?.items.map((s) => <ChargeRow key={s.id} s={s} />)
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

function Home({
  hasVehicle,
  pending,
  onScan,
  onTopup,
  onResume,
}: {
  hasVehicle: boolean;
  /** A manual charge still waiting for (or holding) the attendant's price. */
  pending: PendingManual | null;
  onScan: () => void;
  onTopup: () => void;
  onResume: (pending: PendingManual) => void;
}) {
  const { data: session } = useSession();
  const wallet = useWalletStats();
  const month = useChargeStats(resolveDateFilter({ preset: "month" }, lagosDate()));
  const recent = useWalletAllocations(1);
  const latestCharge = useChargeSessions(1).data?.items[0];
  const now = useNow();
  const balance = wallet.data?.wallet_balance ?? session?.profile?.user.ev_wallet_balance ?? 0;
  const empty = balance <= 0;

  const openTopup = recent.data?.items.find(
    (a) => a.status === "PENDING_PAYMENT" && (!a.checkout_expires_at || Date.parse(a.checkout_expires_at) > now),
  );
  const crediting = recent.data?.items.find((a) => a.status === "AWAITING_ALLOCATION");
  const charging =
    latestCharge?.status === "STARTED" && now - Date.parse(latestCharge.created_at) < LIVE_WINDOW_MS ? latestCharge : null;

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
          {/* Looking up a charger doesn't need a vehicle; pricing and paying do, and the server has the final say. */}
          <button className={empty ? "ch-btn alt" : "ch-btn"} type="button" onClick={onScan}>
            <QrCode size={20} /> Charge my car
          </button>
          <button className={empty ? "ch-btn" : "ch-btn alt"} disabled={!hasVehicle} type="button" onClick={onTopup}>
            <Plus size={20} /> Add credit
          </button>
        </div>
        {empty && hasVehicle ? <small className="ch-hint">Your wallet is empty. Add credit to start charging.</small> : null}
      </section>

      {pending ? <PendingManualBanner pending={pending} onOpen={() => onResume(pending)} /> : null}

      {charging ? (
        <div className="tu-open static ch-live">
          <span className="ch-live-icon">
            <Zap size={17} fill="currentColor" />
          </span>
          <span>
            <b>
              Charging at {chargerName(charging.charger_id)} · Plug {charging.connector_id}
            </b>
            <small>{naira(charging.amount)} paid. We&apos;ll let you know when it finishes; unused credit comes back automatically.</small>
          </span>
        </div>
      ) : null}

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
          <Car size={16} /> You can look up a charger now. Charging and adding credit unlock once an admin assigns you a vehicle. We&apos;ll let you know.
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
  blocked,
  onQuote,
  onBack,
  onHome,
}: {
  charger: ChargerInfo;
  connectorId: string;
  pending: boolean;
  error: string | null;
  /** Why this driver can't be priced yet (no vehicle). The server's word wins, so "check again" stays available. */
  blocked: string | null;
  onQuote: () => void;
  onBack: () => void;
  onHome: () => void;
}) {
  if (blocked)
    return (
      <div className="cl-card cl-intro">
        <Back onClick={onBack} />
        <span className="cl-intro-icon">
          <Car size={30} />
        </span>
        <h2>A vehicle is needed to charge</h2>
        <p>{blocked}</p>
        {error && error !== blocked ? (
          <div className="cl-notice bad" role="alert">
            <CircleAlert size={16} /> {error}
          </div>
        ) : null}
        <button className="primary-button" type="button" onClick={onHome}>
          Back to wallet
        </button>
        <button className="ghost-button" disabled={pending} type="button" onClick={onQuote}>
          {pending ? <Spinner /> : <RefreshCw size={18} />} Check again
        </button>
      </div>
    );

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
/* Amount picker, shared by charger-priced and operator-priced flows */
/* ---------------------------------------------------------------- */
function AmountPicker({
  full,
  balance,
  rate,
  amount,
  onAmount,
  onTopup,
}: {
  /** The price of a full charge. */
  full: number;
  balance: number;
  /** ₦/kWh, for the "≈ kWh" hint. */
  rate: number | null | undefined;
  amount: number;
  onAmount: (amount: number) => void;
  onTopup: (suggested: number) => void;
}) {
  const max = Math.min(full, balance);
  const canFull = balance >= full;
  const floor = Math.min(max, 100);

  const chips = useMemo(() => {
    if (max < 1) return [];
    const round = (share: number) => Math.max(1, Math.min(max, Math.round((max * share) / 50) * 50 || 1));
    return [...new Set([round(0.25), round(0.5), round(0.75), max])];
  }, [max]);

  if (max < 1)
    return (
      <div className="cl-notice bad">
        <Wallet size={16} /> Your wallet is empty. Add credit first, then come back to charge.
      </div>
    );

  return (
    <>
      <div className="ch-pick">
        <strong className="ch-pick-amount">{naira(amount)}</strong>
        <small>
          {amount === full ? "Full charge" : "Partial charge"}
          {rate ? ` · ≈ ${kwh(amount / rate)} kWh` : ""}
        </small>
      </div>

      {max > 1 ? (
        <input
          aria-label="Amount to charge"
          className="ch-range"
          max={max}
          min={floor}
          step={1}
          style={{ ["--fill" as string]: `${((amount - floor) / Math.max(1, max - floor)) * 100}%` }}
          type="range"
          value={amount}
          onChange={(e) => onAmount(Number(e.target.value))}
        />
      ) : null}

      <div className="ch-chips">
        {chips.map((value) => (
          <button aria-pressed={amount === value} key={value} type="button" onClick={() => onAmount(value)}>
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
  notice,
  outerError,
  ratePerKwh,
  onRequote,
  requoting,
  onStarted,
  onInsufficient,
  onTaken,
  onTopup,
  onBack,
}: {
  charger: ChargerInfo;
  connectorId: string;
  quote: ChargeQuote;
  quotedAt: number;
  /** Shown above everything, e.g. why the price was just refreshed. */
  notice?: string;
  /** A failed re-quote, reported by the parent. */
  outerError: string | null;
  ratePerKwh: number | null;
  onRequote: () => void;
  requoting: boolean;
  onStarted: (result: ChargeStarted) => void;
  /** The wallet couldn't cover the amount (402): re-quote so the balance is fresh. */
  onInsufficient: (amount: number, error: unknown) => void;
  /** Someone else took the plug (409). */
  onTaken: (message: string) => void;
  /** Opens the top-up flow, suggesting how much is missing. */
  onTopup: (suggested: number) => void;
  onBack: () => void;
}) {
  const start = useStartCharge();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const sent = useRef(false); // a second tap can never send a second debit

  const full = quote.quoted_amount ?? 0;
  const balance = quote.sub_wallet_balance;
  const max = Math.min(full, balance);
  const canFull = balance >= full;
  const [amount, setAmount] = useState(max);
  // The charger's own price is what this session is billed at; the platform rate is only a fallback.
  const rate = quote.price_per_kwh || ratePerKwh;

  // A quote isn't a reservation: after a few minutes ask for a fresh price.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const stale = now - quotedAt > STALE_QUOTE_MS;

  const submit = async () => {
    if (sent.current) return;
    sent.current = true;
    setError(null);
    try {
      const result = await start.mutateAsync({ chargerId: charger.charger_id, connectorId, amount });
      onStarted(result);
      return;
    } catch (e) {
      if (isStatus(e, 402) || isStatus(e, 409)) {
        sent.current = false; // nothing was debited; the parent takes it from here
        return isStatus(e, 402) ? onInsufficient(amount, e) : onTaken(chargeError(e));
      }
      if (isUncertain(e)) {
        // The answer may have been lost on the way back. Look before ever retrying.
        setChecking(true);
        try {
          const latest = (await api.chargeSessions(1, 1)).items[0];
          const ours =
            latest &&
            latest.amount === amount &&
            latest.charger_id === charger.charger_id &&
            latest.connector_id === connectorId &&
            Date.now() - Date.parse(latest.created_at) < 3 * 60_000;
          if (ours) {
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
    }
    sent.current = false;
  };

  const busy = start.isPending || checking;
  const soc = Math.max(0, Math.min(100, quote.soc_percent ?? 0));
  const shown = error ?? outerError;

  return (
    <div className="cl-card ch-amount">
      <Back onClick={onBack} label="Change plug" />
      <div className="cl-step-head">
        <small>Step 3</small>
        <h2>Choose how much</h2>
      </div>

      {notice ? (
        <div className="cl-notice warn" role="status">
          <Wallet size={16} /> {notice}
        </div>
      ) : null}

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
          <dt>
            Full charge
            {quote.kwh_needed ? <small>≈ {kwh(quote.kwh_needed)} kWh to full</small> : null}
          </dt>
          <dd>{naira(full)}</dd>
        </div>
        {quote.price_per_kwh ? (
          <div>
            <dt>Charger price</dt>
            <dd>{naira(quote.price_per_kwh)} / kWh</dd>
          </div>
        ) : null}
        <div>
          <dt>Your wallet</dt>
          <dd className={canFull ? "" : "low"}>{naira(balance)}</dd>
        </div>
      </dl>

      <AmountPicker amount={amount} balance={balance} full={full} rate={rate} onAmount={setAmount} onTopup={onTopup} />

      {stale ? (
        <div className="cl-notice">
          <RefreshCw size={16} /> This price is a few minutes old. Refresh it before you start.
        </div>
      ) : null}

      {shown ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {shown}
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
        <button className="primary-button" disabled={busy || requoting || amount < 1} type="button" onClick={() => void submit()}>
          {busy || requoting ? <Spinner /> : <Zap size={19} fill="currentColor" />}{" "}
          {checking ? "Confirming…" : requoting ? "Checking your balance…" : busy ? "Starting…" : `Pay ${naira(amount)} & start charging`}
        </button>
      )}
      <small className="cl-fine">The amount is taken from your wallet. If the charger delivers less, the difference is refunded automatically.</small>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Manual chargers: an attendant sets the price, then the driver pays */
/* ---------------------------------------------------------------- */
const PAY_WINDOW_MS = 5 * 60_000;
const PENDING_KEY = "ev:pending-manual-charge";
const PENDING_MAX_AGE = 2 * 60 * 60_000; // the server forgets unpriced sessions after about 2 hours

type PendingManual = { sessionId: string; charger: ChargerInfo; connectorId: string; balance: number; savedAt: number };

const PENDING_EVENT = "ev:pending-manual-charge-changed";

/** Remembers a manual charge waiting for its price, so leaving the screen doesn't lose it. Storage may be unavailable. */
const pendingManual = {
  /** The raw stored string (stable between calls, as useSyncExternalStore needs), or null once too old to matter. */
  snapshot(): string | null {
    try {
      const raw = window.localStorage.getItem(PENDING_KEY);
      const savedAt = raw ? (JSON.parse(raw) as PendingManual).savedAt : 0;
      return raw && Date.now() - savedAt < PENDING_MAX_AGE ? raw : null;
    } catch {
      return null;
    }
  },
  subscribe(onChange: () => void) {
    window.addEventListener("storage", onChange);
    window.addEventListener(PENDING_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(PENDING_EVENT, onChange);
    };
  },
  save(value: Omit<PendingManual, "savedAt">) {
    try {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
    } catch {}
    window.dispatchEvent(new Event(PENDING_EVENT));
  },
  clear() {
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {}
    window.dispatchEvent(new Event(PENDING_EVENT));
  },
};

function usePendingManual(): PendingManual | null {
  // Null on the server and during hydration; the stored value appears right after.
  const raw = useSyncExternalStore(pendingManual.subscribe, pendingManual.snapshot, () => null);
  return useMemo(() => (raw ? (JSON.parse(raw) as PendingManual) : null), [raw]);
}

/**
 * When the attendant's price stops being payable. expires_at is on the server's clock, so it is trusted only when it
 * agrees with the documented 5-minute window; a phone clock that is minutes off falls back to "5 minutes from arrival".
 */
function payDeadline({ session, receivedAt }: ManualQuoteCache) {
  const server = session.expires_at ? Date.parse(session.expires_at) : NaN;
  const left = server - receivedAt;
  return Number.isFinite(left) && left > 0 && left <= PAY_WINDOW_MS + 15_000 ? server : receivedAt + PAY_WINDOW_MS;
}

function useTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Home-screen reminder for a manual charge that is waiting for (or has) its price. */
function PendingManualBanner({ pending, onOpen }: { pending: PendingManual; onOpen: () => void }) {
  const manual = useManualChargeSession(pending.sessionId);
  const now = useTick(1000);
  const priced = manual.data && isOperatorPriced(manual.data.session) ? manual.data : null;
  const left = priced ? payDeadline(priced) - now : 0;
  const gone = isStatus(manual.error, 404) || isStatus(manual.error, 403);

  useEffect(() => {
    if (gone) pendingManual.clear(); // paid, expired or not ours: nothing left to resume
  }, [gone]);

  if (gone) return null;
  return (
    <button className={`tu-open ${priced && left > 0 ? "ch-live" : ""}`} type="button" onClick={onOpen}>
      {priced && left > 0 ? <Zap size={18} fill="currentColor" /> : <Hourglass size={18} />}
      <span>
        {priced && left > 0 ? (
          <>
            <b>Your price is ready: {naira(priced.session.quoted_amount)}</b>
            <small>Pay within {clock(left)} to start charging at Plug {pending.connectorId}.</small>
          </>
        ) : priced ? (
          <>
            <b>Your price expired</b>
            <small>Tap to ask the attendant for a new one.</small>
          </>
        ) : (
          <>
            <b>Waiting for the attendant&apos;s price</b>
            <small>
              Plug {pending.connectorId} · {pending.charger.location_name ?? chargerName(pending.charger.charger_id)}. Tap to view.
            </small>
          </>
        )}
      </span>
    </button>
  );
}

function OperatorStep({
  charger,
  connectorId,
  sessionId,
  knownBalance,
  ratePerKwh,
  requoting,
  outerError,
  onPaid,
  onRequote,
  onRescan,
  onTopup,
  onBack,
}: {
  charger: ChargerInfo;
  connectorId: string;
  sessionId: string;
  /** The last balance the server knew when the request was opened (not live). */
  knownBalance: number;
  ratePerKwh: number | null;
  requoting: boolean;
  outerError: string | null;
  onPaid: (result: ChargeStarted) => void;
  /** Opens a new price request (a new /quote) after this one expired. */
  onRequote: () => void;
  onRescan: () => void;
  onTopup: (suggested: number) => void;
  onBack: () => void;
}) {
  const manual = useManualChargeSession(sessionId);
  const wallet = useWalletStats();
  const confirm = useConfirmCharge();
  const now = useTick(1000);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [needsNewPrice, setNeedsNewPrice] = useState(false);
  const [gone, setGone] = useState(false);
  const sent = useRef(false); // a second tap can never send a second debit

  const priced = manual.data && isOperatorPriced(manual.data.session) ? manual.data : null;
  const full = priced?.session.quoted_amount ?? 0;
  const balance = wallet.data?.wallet_balance ?? knownBalance;
  const max = Math.min(full, balance);
  const [picked, setPicked] = useState<number | null>(null);
  // Starts at the most the driver can pay, and never exceeds it if the balance or price moves.
  const amount = Math.max(0, Math.min(picked ?? max, max));
  const left = priced ? payDeadline(priced) - now : 0;
  const expired = Boolean(priced) && left <= 0;
  const ended = gone || isStatus(manual.error, 404) || isStatus(manual.error, 403);

  // A price that finally arrives deserves a nudge, especially if the phone was in a pocket.
  const announced = useRef(false);
  useEffect(() => {
    if (!priced || announced.current) return;
    announced.current = true;
    navigator.vibrate?.([120, 70, 120]);
  }, [priced]);

  useEffect(() => {
    if (ended) pendingManual.clear();
  }, [ended]);

  const submit = async () => {
    if (sent.current || !priced) return;
    sent.current = true;
    setError(null);
    try {
      const result = await confirm.mutateAsync({ sessionId, amount });
      pendingManual.clear();
      onPaid({ session_id: result.session_id || sessionId, debited: result.confirmed_amount, remaining_balance: result.remaining_balance });
      return;
    } catch (e) {
      if (isUncertain(e)) {
        // The answer may have been lost on the way back. A paid session shows up in history (and is gone from /manual).
        setChecking(true);
        try {
          const row = (await api.chargeSessions(1, 5)).items.find((s) => s.lotgrids_session_id === sessionId);
          if (row) {
            pendingManual.clear();
            onPaid({ session_id: sessionId, debited: row.amount, remaining_balance: row.remaining_balance ?? balance - row.amount });
            return;
          }
          await api.manualChargeSession(sessionId); // still open, so nothing was charged
          setError(`${chargeError(e)} Nothing was charged.`);
        } catch {
          setError("We couldn't confirm whether your payment went through. Check your recent charges before trying again.");
        } finally {
          setChecking(false);
        }
      } else {
        setError(confirmError(e));
        if (isStatus(e, 404) || isStatus(e, 403)) setGone(true);
        if (isStatus(e, 409)) setNeedsNewPrice(true);
      }
    }
    sent.current = false;
  };

  const place = charger.location_name ?? chargerName(charger.charger_id);
  const shown = error ?? outerError;
  const leave = () => {
    pendingManual.clear();
    onBack();
  };

  if (ended)
    return (
      <div className="cl-card cl-intro">
        <Back onClick={leave} />
        <span className="cl-intro-icon">
          <CircleAlert size={30} />
        </span>
        <h2>This charge request has ended</h2>
        <p>{shown ?? "It may have expired, or it was already paid for. Scan the charger to start again."}</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            pendingManual.clear();
            onRescan();
          }}
        >
          <QrCode size={19} /> Scan the charger
        </button>
      </div>
    );

  if (!priced)
    return (
      <div className="cl-card cl-intro ch-wait">
        <Back onClick={leave} label="Choose another plug" />
        <span className="cl-intro-icon cl-scan-icon">
          <Hourglass size={30} />
        </span>
        <h2>Waiting for the attendant</h2>
        <p>
          This charger is priced by the attendant on site. Ask them to set the price for <b>Plug {connectorId}</b> at {place}. It will appear here by itself, so
          there&apos;s no need to refresh.
        </p>
        <span className="ch-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <dl className="ch-lines">
          <div>
            <dt>Your wallet</dt>
            <dd>{naira(balance)}</dd>
          </div>
        </dl>
        {manual.isError ? (
          <div className="cl-notice" role="status">
            <CircleAlert size={16} /> We&apos;re having trouble checking for the price. We&apos;ll keep trying.
          </div>
        ) : null}
        <small className="cl-fine">Nothing is taken from your wallet until you pay. You can leave this screen; we&apos;ll notify you when the price is ready.</small>
      </div>
    );

  return (
    <div className="cl-card ch-amount">
      <Back onClick={leave} label="Change plug" />
      <div className="cl-step-head">
        <small>Step 3</small>
        <h2>Pay for your charge</h2>
      </div>

      <div className={`ch-timer ${expired ? "over" : left < 60_000 ? "soon" : ""}`} role="timer" aria-live="off">
        <Hourglass size={16} />
        {expired ? (
          <span>This price has expired</span>
        ) : (
          <span>
            Price valid for <b>{clock(left)}</b>
          </span>
        )}
        <i style={{ ["--left" as string]: `${Math.max(0, Math.min(1, left / PAY_WINDOW_MS)) * 100}%` }} />
      </div>

      <dl className="ch-lines">
        <div>
          <dt>
            Attendant&apos;s price
            {priced.session.kwh_needed ? <small>≈ {kwh(priced.session.kwh_needed)} kWh</small> : null}
          </dt>
          <dd>{naira(full)}</dd>
        </div>
        {priced.session.price_per_kwh ? (
          <div>
            <dt>Charger price</dt>
            <dd>{naira(priced.session.price_per_kwh)} / kWh</dd>
          </div>
        ) : null}
        <div>
          <dt>Your wallet</dt>
          <dd className={balance >= full ? "" : "low"}>{naira(balance)}</dd>
        </div>
        <div>
          <dt>Plug</dt>
          <dd>
            {connectorId} · {place}
          </dd>
        </div>
      </dl>

      {expired || needsNewPrice ? null : (
        <AmountPicker amount={amount} balance={balance} full={full} rate={priced.session.price_per_kwh || ratePerKwh} onAmount={setPicked} onTopup={onTopup} />
      )}

      {shown ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {shown}
        </div>
      ) : null}

      {expired || needsNewPrice ? (
        <button className="primary-button" disabled={requoting} type="button" onClick={onRequote}>
          {requoting ? <Spinner /> : <RefreshCw size={19} />} Ask for a new price
        </button>
      ) : max < 1 ? (
        <button className="primary-button" type="button" onClick={() => onTopup(full)}>
          <Wallet size={19} /> Add credit
        </button>
      ) : (
        <button className="primary-button" disabled={confirm.isPending || checking || amount < 1} type="button" onClick={() => void submit()}>
          {confirm.isPending || checking ? <Spinner /> : <Zap size={19} fill="currentColor" />}{" "}
          {checking ? "Confirming…" : confirm.isPending ? "Paying…" : `Pay ${naira(amount)}`}
        </button>
      )}
      <small className="cl-fine">The attendant starts the charge after you pay. If the charger delivers less, the difference is refunded automatically.</small>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Started, then followed live until it ends                         */
/* ---------------------------------------------------------------- */
function Done({
  result,
  charger,
  connectorId,
  startedAt,
  manual = false,
  onDone,
}: {
  result: ChargeStarted;
  charger: ChargerInfo;
  connectorId: string;
  startedAt: number;
  /** Paid to an attendant's price: they still have to start the charger. */
  manual?: boolean;
  onDone: () => void;
}) {
  const live = useLiveChargeSession(result.session_id, startedAt);
  const wallet = useWalletStats();
  const session = live.data ?? null;
  const ended = session != null && !isCharging(session);
  const stopped = session?.status === "INTERRUPTED";
  const refund = session?.refund_amount ?? 0;
  const used = session?.actual_dispensed_value;
  const place = `Plug ${connectorId} · ${charger.location_name ?? chargerName(charger.charger_id)}`;

  const title = !ended ? (manual ? "Paid. Ready to charge" : "Charging started") : stopped ? "Charging stopped early" : "Charging complete";
  const message = !ended
    ? manual
      ? `The attendant will now start charging your car at ${place}. You can leave this screen; we'll let you know when it finishes.`
      : `Your car is charging at ${place}. You can leave this screen; we'll let you know when it finishes.`
    : refund > 0
      ? `${naira(refund)} of unused credit went back to your wallet.`
      : stopped
        ? "The charger ended the session before it finished."
        : "Your car got everything you paid for.";

  return (
    <div className="cl-flow">
      <section className={`cl-card cl-done ${!ended ? "live" : stopped ? "warn" : ""}`} aria-live="polite">
        <span className="cl-done-icon" key={session?.status ?? "live"}>
          {!ended ? <Zap size={30} fill="currentColor" /> : stopped ? <CircleAlert size={30} /> : <Check size={30} strokeWidth={3} />}
        </span>
        <h2>{title}</h2>
        <p>{message}</p>
        {!ended ? (
          <span className="ch-live-tag">
            <i /> Live
          </span>
        ) : null}
      </section>

      <section className="cl-card">
        <dl className="ch-lines">
          <div>
            <dt>Paid from wallet</dt>
            <dd>{naira(result.debited)}</dd>
          </div>
          {ended && used != null ? (
            <div>
              <dt>Energy delivered</dt>
              <dd>{naira(used)}</dd>
            </div>
          ) : null}
          {refund > 0 ? (
            <div>
              <dt>Refunded</dt>
              <dd className="ch-refund">+{naira(refund)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Wallet balance</dt>
            <dd>{naira(wallet.data?.wallet_balance ?? result.remaining_balance)}</dd>
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
        <p className="cl-tip">
          {ended
            ? "This charge is in your history. Keep the session ID if you need to contact support."
            : "If the charger delivers less than you paid for, the difference goes back to your wallet automatically. Keep the session ID for support."}
        </p>
      </section>

      <button className="primary-button" type="button" onClick={onDone}>
        {ended ? "Done" : "Back to wallet"}
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
  // Set by a 400 from the server; cleared as soon as a quote goes through.
  const [blocked, setBlocked] = useState<string | null>(null);
  const pending = usePendingManual();
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

  /** Someone else took the plug: show the fresh availability with the reason on top. */
  const backToConnectors = (charger: ChargerInfo, message: string) => {
    connectors.mutate(charger.charger_id, {
      onSuccess: (fresh) => {
        go({ k: "connectors", charger: fresh });
        setError(message);
      },
      onError: () => {
        go({ k: "connectors", charger });
        setError(message);
      },
    });
  };

  if (step.k === "home")
    return (
      <Home
        hasVehicle={hasVehicle}
        pending={pending}
        onResume={(p) => go({ k: "operator", charger: p.charger, connectorId: p.connectorId, sessionId: p.sessionId, balance: p.balance })}
        onScan={() => go({ k: "scan" })}
        onTopup={() => go({ k: "topup", back: { k: "home" } })}
      />
    );

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

  const quote = (charger: ChargerInfo, connectorId: string, notice?: string, fallbackError?: string) => {
    setError(null);
    quoteMutation.mutate(
      { chargerId: charger.charger_id, connectorId },
      {
        onSuccess: (result) => {
          setBlocked(null);
          if (result.awaiting_operator_quote && result.session_id) {
            // A manual charger: the attendant prices it, and it is paid with /confirm, never /start.
            const manual = { charger, connectorId, sessionId: result.session_id, balance: result.sub_wallet_balance };
            pendingManual.save(manual);
            return go({ k: "operator", ...manual });
          }
          pendingManual.clear(); // any older manual request is superseded by this charger
          if (result.quoted_amount == null) return setError("We couldn't price this charge. Make sure your vehicle is plugged in and try again.");
          go({ k: "amount", charger, connectorId, quote: result, quotedAt: Date.now(), notice });
        },
        onError: (e) => {
          if (isStatus(e, 409)) return backToConnectors(charger, chargeError(e));
          if (isStatus(e, 400)) {
            setBlocked(chargeError(e));
            return go({ k: "plug", charger, connectorId });
          }
          setError(fallbackError ?? chargeError(e));
        },
      },
    );
  };

  if (step.k === "plug")
    return (
      <PlugIn
        blocked={blocked ?? (hasVehicle ? null : NO_VEHICLE)}
        charger={step.charger}
        connectorId={step.connectorId}
        error={error}
        pending={quoteMutation.isPending}
        onBack={() => go({ k: "connectors", charger: step.charger })}
        onHome={() => go({ k: "home" })}
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
        notice={step.notice}
        outerError={error}
        quote={step.quote}
        quotedAt={step.quotedAt}
        ratePerKwh={wallet.data?.current_rate_per_kwh ?? null}
        requoting={quoteMutation.isPending}
        onBack={() => go({ k: "connectors", charger: step.charger })}
        onInsufficient={(amount, e) =>
          // The balance moved since the quote. Re-quote so the slider and buttons match what's really there.
          quote(
            step.charger,
            step.connectorId,
            `Your wallet couldn't cover ${naira(amount)}, so we've refreshed your balance. Pick an amount you can cover, or add credit.`,
            chargeError(e),
          )
        }
        onRequote={() => quote(step.charger, step.connectorId)}
        onStarted={(result) => go({ k: "done", result, charger: step.charger, connectorId: step.connectorId, startedAt: Date.now() })}
        onTaken={(message) => backToConnectors(step.charger, message)}
        onTopup={(suggested) => go({ k: "topup", suggested, back: step })}
      />
    );

  if (step.k === "operator")
    return (
      <OperatorStep
        // A new price request is a new session: start the screen fresh.
        key={step.sessionId}
        charger={step.charger}
        connectorId={step.connectorId}
        knownBalance={step.balance}
        outerError={error}
        ratePerKwh={wallet.data?.current_rate_per_kwh ?? null}
        requoting={quoteMutation.isPending}
        sessionId={step.sessionId}
        onBack={() => go({ k: "connectors", charger: step.charger })}
        onPaid={(result) => go({ k: "done", result, charger: step.charger, connectorId: step.connectorId, startedAt: Date.now(), manual: true })}
        onRequote={() => quote(step.charger, step.connectorId)}
        onRescan={() => go({ k: "scan" })}
        onTopup={(suggested) => go({ k: "topup", suggested, back: step })}
      />
    );

  if (step.k !== "done") return null;
  return (
    <Done
      charger={step.charger}
      connectorId={step.connectorId}
      manual={step.manual}
      result={step.result}
      startedAt={step.startedAt}
      onDone={() => go({ k: "home" })}
    />
  );
}
