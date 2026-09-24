"use client";

import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Building2, Car, Clock, Copy, LogOut, MapPin, TrendingUp, User, Wallet, Zap } from "lucide-react";
import { ThemeToggle } from "./components/ThemeToggle";
import { useLogout } from "./lib/queries";

const naira = (value: number | null | undefined) => `₦${Number(value ?? 0).toLocaleString()}`;

export default function HomePage() {
  const { data: session } = useSession();
  const logout = useLogout();
  const profile = session?.profile;

  // The proxy guarantees a signed-in session here; this only covers the instant after sign-out.
  if (!profile) {
    return (
      <div className="boot" aria-label="Loading">
        <span className="skeleton" style={{ height: "3rem" }} />
        <span className="skeleton" style={{ height: "10rem" }} />
        <span className="skeleton" style={{ height: "8rem" }} />
      </div>
    );
  }

  const account = profile.virtual_account ?? profile.user.virtual_account;
  const vehicle = profile.vehicle ?? profile.user.vehicle;
  const onShift = profile.user.shift;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const initials = `${profile.user.first_name[0] ?? ""}${profile.user.last_name[0] ?? ""}`.toUpperCase();
  const vehicleMeta = [vehicle?.vehicle_make?.name, vehicle?.vehicle_model?.name].filter(Boolean).join(" ");

  async function copyAccount() {
    if (!account?.account_number) return;
    try {
      await navigator.clipboard.writeText(account.account_number);
      toast.success("Account number copied.");
    } catch {
      toast.error("Couldn't copy. Long-press the number to copy it.");
    }
  }

  return (
    <div className="screen-enter">
      <section className="home">
        <div className="greeting">
          <span className="avatar">{initials || <User size={20} />}</span>
          <div>
            <small>{greeting}</small>
            <h1>{profile.user.first_name}</h1>
          </div>
          <span className={`pill ${onShift ? "pill-live" : ""}`}>
            <i /> {onShift ? "On shift" : "Off shift"}
          </span>
          <ThemeToggle />
        </div>

        <div className="wallet">
          <div className="hero-glow" aria-hidden="true" />
          <div className="wallet-row">
            <span className="wallet-label"><Wallet size={16} /> Wallet balance</span>
            <Zap size={18} fill="currentColor" />
          </div>
          <strong className="wallet-amount">{naira(profile.user.ev_wallet_balance)}</strong>
          <div className="wallet-foot">
            <TrendingUp size={16} />
            <span>Today&apos;s inflow</span>
            <b>{naira(profile.dva_total_amount_received)}</b>
            {profile.dva_transaction_count ? <em>{profile.dva_transaction_count} txns</em> : null}
          </div>
        </div>

        <section className="panel">
          <h2><Building2 size={16} /> Payment account</h2>
          {account ? (
            <>
              <div className="account-number">
                <strong>{account.account_number}</strong>
                <button className="copy-button" type="button" onClick={copyAccount} aria-label="Copy account number">
                  <Copy size={16} /> Copy
                </button>
              </div>
              <dl className="details">
                <div><dt>Account name</dt><dd>{account.account_name}</dd></div>
                <div><dt>Bank</dt><dd>{account.bank_name}</dd></div>
              </dl>
            </>
          ) : (
            <p className="empty"><Clock size={18} /> Your bank account is being set up. It will appear here shortly.</p>
          )}
        </section>

        <section className="panel">
          <h2><Car size={16} /> Your vehicle</h2>
          {vehicle ? (
            <>
              <div className="vehicle-top">
                <div>
                  <strong>{vehicle.name}</strong>
                  {vehicleMeta ? <small>{vehicleMeta}</small> : null}
                </div>
                <span className="plate">{vehicle.plate_number}</span>
              </div>
              {vehicle.location_state ? <p className="meta"><MapPin size={16} /> {vehicle.location_state}</p> : null}
            </>
          ) : (
            <p className="empty"><Car size={18} /> No vehicle assigned yet. We&apos;ll notify you once one is ready.</p>
          )}
        </section>

        <button className="ghost-button" disabled={logout.isPending} type="button" onClick={() => logout.mutate()}>
          <LogOut size={18} /> {logout.isPending ? "Signing out…" : "Log out"}
        </button>
      </section>
    </div>
  );
}
