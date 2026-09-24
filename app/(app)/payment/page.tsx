"use client";

import { useSession } from "next-auth/react";
import { Building2, Clock, TrendingUp } from "lucide-react";
import { naira } from "../../lib/format";
import { paymentAccounts } from "../../lib/banks";
import { BankAccountList } from "../../components/BankAccountList";

export default function PaymentPage() {
  const { data: session } = useSession();
  const profile = session?.profile;
  if (!profile) return null;

  const accounts = paymentAccounts(profile);

  return (
    <div className="screen-enter">
      <section className="home">
        <div className="stat-row">
          <div className="stat">
            <span><TrendingUp size={15} /> Today&apos;s inflow</span>
            <strong>{naira(profile.dva_total_amount_received)}</strong>
          </div>
          <div className="stat">
            <span>Transactions</span>
            <strong>{profile.dva_transaction_count ?? 0}</strong>
          </div>
        </div>

        <section className="panel">
          <h3 className="panel-title"><Building2 size={16} /> Payment accounts</h3>
          {accounts.length ? (
            <BankAccountList accounts={accounts} />
          ) : (
            <p className="empty"><Clock size={18} /> Your bank account is being set up. It will appear here shortly.</p>
          )}
        </section>
      </section>
    </div>
  );
}
