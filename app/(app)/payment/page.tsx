"use client";

import { useSession } from "next-auth/react";
import { paymentAccounts } from "../../lib/banks";
import { AccountCards } from "../../components/payment/AccountCards";
import { Transactions } from "../../components/payment/Transactions";

export default function PaymentPage() {
  const { data: session } = useSession();
  const profile = session?.profile;
  if (!profile) return null;

  return (
    <div className="screen-enter">
      <section className="home">
        <AccountCards accounts={paymentAccounts(profile)} />
        <Transactions />
      </section>
    </div>
  );
}
