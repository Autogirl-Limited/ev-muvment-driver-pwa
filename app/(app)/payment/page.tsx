"use client";

import { useSession } from "next-auth/react";
import { Building2, Clock, Copy, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { naira } from "../../lib/format";

export default function PaymentPage() {
  const { data: session } = useSession();
  const profile = session?.profile;
  if (!profile) return null;

  const account = profile.virtual_account ?? profile.user.virtual_account;

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
          <h3 className="panel-title"><Building2 size={16} /> Payment account</h3>
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
      </section>
    </div>
  );
}
