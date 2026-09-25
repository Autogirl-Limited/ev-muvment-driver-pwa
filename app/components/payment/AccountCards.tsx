"use client";

import { Clock, Info } from "lucide-react";
import { paymentAccountKey, type PaymentAccount } from "../../lib/banks";
import { AccountCopyButton } from "../AccountCopyButton";
import { BankLogo } from "../BankLogo";
import { Carousel, type CarouselSlide } from "../Carousel";

const TONES = ["slide-blue", "slide-indigo", "slide-slate"] as const;

function spaced(number: string) {
  return number.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function AccountCard({ account, tone }: { account: PaymentAccount; tone: string }) {
  return (
    <article className={`slide ${tone} acct`}>
      <header className="slide-head">
        <BankLogo name={account.bank_name} />
        <span className="slide-chip static">Your account</span>
      </header>

      <div className="acct-number">
        <small>Account number</small>
        <strong aria-label={account.account_number}>{spaced(account.account_number)}</strong>
      </div>

      <div className="slide-foot">
        <span className="slide-bank">
          <small>{account.bank_name}</small>
          <b className="acct-name">{account.account_name}</b>
        </span>
        <AccountCopyButton compact bank={account.bank_name} value={account.account_number} />
      </div>
    </article>
  );
}

/** The driver's dedicated accounts, one swipeable card each: the same look as the home summary. */
export function AccountCards({ accounts }: { accounts: PaymentAccount[] }) {
  if (!accounts.length) {
    return (
      <section className="panel">
        <p className="empty">
          <Clock size={18} /> Your bank account is being set up. It will appear here shortly.
        </p>
      </section>
    );
  }

  const slides: CarouselSlide[] = accounts.map((account, i) => ({
    key: paymentAccountKey(account),
    label: account.bank_name,
    node: <AccountCard account={account} tone={TONES[i % TONES.length]} />,
  }));

  return (
    <div className="acct-wrap">
      <Carousel idPrefix="acct" label="Your payment accounts" slides={slides} />
      <p className="acct-hint">
        <Info size={14} /> Anyone can send money to {accounts.length > 1 ? "any of these accounts" : "this account"}. Transfers show up below as soon as they land.
      </p>
    </div>
  );
}
