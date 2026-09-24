"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { BatteryCharging, Building2, Wallet, X, Zap } from "lucide-react";
import { kwh, lagosDate, naira } from "../lib/format";
import { useChargeStats, useDvaStats, useWalletStats } from "../lib/queries";
import type { DriverProfile } from "../lib/types";
import { Modal } from "./Modal";
import { resolveDateFilter, type DateFilter } from "../lib/date-range";
import { bankIdentity, paymentAccounts } from "../lib/banks";
import { DateRangeFilter } from "./DateRangeFilter";
import { BankLogo } from "./BankLogo";
import { BankAccountList } from "./BankAccountList";
import { AccountCopyButton } from "./AccountCopyButton";

/** Shrinks its text to fit the width available, so a big number never overflows the card. */
function FitText({ children, className }: { children: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  const fit = useCallback(() => {
    const outer = box.current;
    const inner = text.current;
    if (!outer || !inner) return;
    inner.style.transform = "none";
    const ratio = outer.clientWidth / inner.scrollWidth;
    inner.style.transform = ratio < 1 ? `scale(${Math.max(ratio, 0.4)})` : "none";
  }, []);

  useLayoutEffect(fit, [fit, children]);
  useEffect(() => {
    const outer = box.current;
    if (!outer) return;
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <span className={`fit ${className ?? ""}`} ref={box}>
      <span ref={text}>{children}</span>
    </span>
  );
}

function PaymentsSlide({ profile, period, onPeriod }: { profile: DriverProfile; period: DateFilter; onPeriod: (p: DateFilter) => void }) {
  const [open, setOpen] = useState(false);
  const range = resolveDateFilter(period, lagosDate());
  const stats = useDvaStats(range);
  const list = paymentAccounts(profile);
  const [first, ...rest] = list;

  // Login already carries today's totals, so "Today" is never blank while the request runs.
  const fallback = period.preset === "today" && profile.dva_stats_date === lagosDate() ? profile : null;
  const amount = stats.data?.total_amount_received ?? fallback?.dva_total_amount_received;
  const count = stats.data?.transaction_count ?? fallback?.dva_transaction_count;

  return (
    <article className="slide slide-blue">
      <header className="slide-head">
        <span className="slide-label"><Building2 size={15} /> Payments received</span>
        <DateRangeFilter value={period} onChange={onPeriod} className="slide-chip" />
      </header>

      <div className="slide-metric">
        <FitText className="slide-amount">{amount == null ? "—" : naira(amount)}</FitText>
        <p className="slide-sub">{count != null ? `${count} ${count === 1 ? "transaction" : "transactions"}` : stats.isError ? "Couldn’t load payments. Try again shortly." : "Loading payments…"}</p>
      </div>

      {first ? (
        <div className="slide-foot">
          <span className="slide-bank">
            <BankLogo name={first.bank_name} />
            {!bankIdentity(first.bank_name).logo ? <small>{first.bank_name}</small> : null}
            <b>{first.account_number}</b>
          </span>
          <AccountCopyButton compact bank={first.bank_name} value={first.account_number} />
          {rest.length ? (
            <button className="slide-badge" type="button" aria-label={`Show ${rest.length} more accounts`} onClick={() => setOpen(true)}>
              +{rest.length}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="slide-foot"><span className="slide-bank"><small>Your bank account is being set up.</small></span></div>
      )}

      <Modal label="Your payment accounts" open={open} onClose={() => setOpen(false)}>
        <div className="accounts">
          <div className="accounts-head">
            <h2>Payment accounts</h2>
            <button className="icon-button plain" type="button" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <p>Send money to any of these accounts.</p>
          <BankAccountList accounts={list} />
        </div>
      </Modal>
    </article>
  );
}

function EnergySlide({ profile }: { profile: DriverProfile }) {
  const stats = useWalletStats();
  const data = stats.data;
  const balance = data?.wallet_balance ?? profile.user.ev_wallet_balance;

  return (
    <article className="slide slide-indigo">
      <header className="slide-head">
        <span className="slide-label"><Wallet size={15} /> Energy wallet</span>
        {data ? <span className="slide-chip static"><Zap size={13} fill="currentColor" /> {naira(data.current_rate_per_kwh)} / kWh</span> : null}
      </header>

      <div className="slide-metric">
        <FitText className="slide-amount">{naira(balance)}</FitText>
        <p className="slide-sub">
          {data ? <>Enough for about <b>{kwh(data.wallet_balance_kwh)} kWh</b></> : "Loading energy…"}
        </p>
      </div>

      {data && data.pending_amount > 0 ? (
        <div className="slide-foot">
          <span className="slide-bank"><small>Top-up on the way</small><b>{naira(data.pending_amount)}</b></span>
        </div>
      ) : null}
    </article>
  );
}

function ChargeSlide({ period, onPeriod }: { period: DateFilter; onPeriod: (p: DateFilter) => void }) {
  const range = resolveDateFilter(period, lagosDate());
  const stats = useChargeStats(range);
  const spent = stats.data?.total_amount_spent ?? 0;
  const sessions = stats.data?.session_count ?? 0;

  return (
    <article className="slide slide-slate">
      <header className="slide-head">
        <span className="slide-label"><BatteryCharging size={15} /> Charging spent</span>
        <DateRangeFilter value={period} onChange={onPeriod} className="slide-chip" />
      </header>

      <div className="slide-metric">
        <FitText className="slide-amount">{stats.data ? naira(spent) : "—"}</FitText>
        <p className="slide-sub">
          {stats.data ? `${sessions} ${sessions === 1 ? "charge" : "charges"}` : stats.isError ? "Couldn’t load charges. Try again shortly." : "Loading charges…"}
        </p>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Carousel                                                            */
/* ------------------------------------------------------------------ */
export function StatsCarousel() {
  const { data: session } = useSession();
  const profile = session?.profile;
  const [period, setPeriod] = useState<DateFilter>({ preset: "today" });
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const nearest = items.reduce((best, item, index) =>
      Math.abs(item.offsetLeft - el.scrollLeft) < Math.abs(items[best].offsetLeft - el.scrollLeft) ? index : best, 0);
    setActive(nearest);
  };

  const goTo = (index: number) => {
    const el = track.current;
    const item = el?.children[index] as HTMLElement | undefined;
    if (el && item) el.scrollTo({ left: item.offsetLeft });
  };

  if (!profile) return null;

  const slides: { key: string; label: string; node: ReactNode }[] = [
    { key: "payments", label: "Payments received", node: <PaymentsSlide profile={profile} period={period} onPeriod={setPeriod} /> },
    { key: "energy", label: "Energy wallet", node: <EnergySlide profile={profile} /> },
    { key: "charging", label: "Charging spent", node: <ChargeSlide period={period} onPeriod={setPeriod} /> },
  ];

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label="Your account summary">
      <div
        className="carousel-track"
        ref={track}
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-label="Account cards. Use left and right arrow keys to browse."
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next = event.key === "ArrowRight" ? active + 1 : event.key === "ArrowLeft" ? active - 1 : null;
          if (next === null) return;
          event.preventDefault();
          goTo(Math.max(0, Math.min(slides.length - 1, next)));
        }}
      >
        {slides.map((slide, index) => (
          <div
            aria-label={`${index + 1} of ${slides.length}: ${slide.label}`}
            aria-roledescription="slide"
            className="carousel-item"
            id={`stats-${slide.key}`}
            key={slide.key}
            role="group"
            onFocusCapture={() => goTo(index)}
          >
            {slide.node}
          </div>
        ))}
      </div>
      <div className="carousel-dots">
        {slides.map((slide, index) => (
          <button
            aria-current={active === index}
            aria-label={`Show ${slide.label}`}
            aria-controls={`stats-${slide.key}`}
            className={active === index ? "on" : ""}
            key={slide.key}
            type="button"
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </section>
  );
}
