"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  BatteryCharging,
  Car,
  Check,
  CircleAlert,
  Keyboard,
  Plug,
  QrCode,
  RefreshCw,
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
  useChargeQuote,
  useChargerConnectors,
  useChargeSessions,
  useChargeStats,
  useStartCharge,
  useWalletStats,
} from "../../lib/queries";
import type { ChargeQuote, ChargerInfo, ChargeStarted } from "../../lib/types";
import { Pagination } from "../Pagination";
import { Spinner } from "../Ui";
import { QrScanner } from "./QrScanner";

type Step =
  | { k: "home" }
  | { k: "scan" }
  | { k: "connectors"; charger: ChargerInfo }
  | { k: "plug"; charger: ChargerInfo; connectorId: string }
  | { k: "amount"; charger: ChargerInfo; connectorId: string; quote: ChargeQuote; quotedAt: number }
  | { k: "done"; result: ChargeStarted; chargerId: string; connectorId: string };

const STALE_QUOTE_MS = 3 * 60_000;

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
/* Home: wallet, scan, recent charges                                */
/* ---------------------------------------------------------------- */
function Home({ hasVehicle, onScan }: { hasVehicle: boolean; onScan: () => void }) {
  const { data: session } = useSession();
  const wallet = useWalletStats();
  const month = useChargeStats(resolveDateFilter({ preset: "month" }, lagosDate()));
  const [page, setPage] = useState(1);
  const list = useChargeSessions(page);
  const balance = wallet.data?.wallet_balance ?? session?.profile?.user.ev_wallet_balance ?? 0;
  const data = list.data;

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

        <button className="ch-scan" disabled={!hasVehicle} type="button" onClick={onScan}>
          <QrCode size={22} /> Scan charger to start
        </button>
        <Link className="ch-link" href="/payment">
          Need more credit? See your account details
        </Link>
      </section>

      {!hasVehicle ? (
        <div className="cl-notice">
          <Car size={16} /> You can start charging once an admin assigns you a vehicle. We&apos;ll let you know.
        </div>
      ) : null}

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

      <section className="tx" aria-label="Charging history">
        <header className="tx-head">
          <h2>
            <BatteryCharging size={16} /> Recent charges
          </h2>
        </header>
        {list.isPending ? (
          <ul className="tx-list" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li className="tx-skeleton" key={i} />
            ))}
          </ul>
        ) : list.isError ? (
          <div className="panel">
            <p className="empty">
              <CircleAlert size={18} /> Couldn&apos;t load your charges.
            </p>
            <button className="ghost-button" type="button" onClick={() => void list.refetch()}>
              Try again
            </button>
          </div>
        ) : !data?.items.length ? (
          <div className="panel">
            <p className="empty">
              <BatteryCharging size={18} /> No charges yet. Your first one will show up here.
            </p>
          </div>
        ) : (
          <div className={`tx-body ${list.isPlaceholderData ? "loading" : ""}`}>
            <ul className="tx-list">
              {data.items.map((s) => (
                <li className="tx-row static" key={s.id}>
                  <span className="tx-avatar ch-bolt">
                    <Zap size={17} />
                  </span>
                  <span className="tx-main">
                    <strong>
                      {s.charger_id} · Plug {s.connector_id}
                    </strong>
                    <small>{when(s.created_at)}</small>
                  </span>
                  <span className="tx-side">
                    <b className="out">−{naira(s.amount)}</b>
                    <small>{s.energy_kwh != null ? `≈ ${s.energy_kwh.toFixed(2)} kWh` : "—"}</small>
                  </span>
                </li>
              ))}
            </ul>
            <Pagination
              busy={list.isFetching}
              page={data.pagination.page}
              pageSize={CHARGES_PAGE_SIZE}
              totalItems={data.pagination.total_items}
              totalPages={data.pagination.total_pages}
              onPage={setPage}
            />
          </div>
        )}
      </section>
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
  const id = manual.trim();

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
          <QrScanner key={attempt} onError={setCameraFailed} onScan={onCharger} />
        )}
      </div>

      {error ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {error}
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
            if (id) onCharger(id);
          }}
        >
          <div className="field">
            <div className="field-top">
              <label htmlFor="charger-id">Charger ID</label>
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
          <Keyboard size={18} /> Enter charger ID instead
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
              <Plug size={22} />
              <strong>Plug {c.connector_id}</strong>
              <small>{c.available ? "Free" : "In use"}</small>
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
              <Wallet size={16} /> Your wallet doesn&apos;t cover a full charge. Charge what you can, or{" "}
              <Link href="/payment">add credit</Link> first.
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
        <Link className="primary-button" href="/payment">
          <Wallet size={19} /> Add credit
        </Link>
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

  if (step.k === "home") return <Home hasVehicle={hasVehicle} onScan={() => go({ k: "scan" })} />;

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
      />
    );

  return <Done result={step.result} onDone={() => go({ k: "home" })} />;
}
