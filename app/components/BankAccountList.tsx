import { paymentAccountKey, type PaymentAccount } from "../lib/banks";
import { AccountCopyButton } from "./AccountCopyButton";
import { BankLogo } from "./BankLogo";
import styles from "./BankAccounts.module.css";

export function BankAccountList({ accounts }: { accounts: PaymentAccount[] }) {
  return (
    <ul className={styles.list}>
      {accounts.map((account) => (
        <li key={paymentAccountKey(account)} className={styles.account}>
          <div className={styles.bank}>
            <BankLogo name={account.bank_name} />
            <div><strong>{account.bank_name}</strong>{account.account_name ? <small>{account.account_name}</small> : null}</div>
          </div>
          <div className={styles.number}>
            <span><small>Account number</small><strong>{account.account_number}</strong></span>
            <AccountCopyButton bank={account.bank_name} value={account.account_number} />
          </div>
        </li>
      ))}
    </ul>
  );
}
