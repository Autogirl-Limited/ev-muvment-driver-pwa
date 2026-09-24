import type { DriverProfile } from "./types";

export function bankIdentity(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("moniepoint")) return { key: "moniepoint", logo: "/images/bank/moniepoint-logo.svg" };
  if (normalized.includes("wema") || normalized === "alat") return { key: "wema", logo: "/images/bank/wema-logo.svg" };
  if (normalized.includes("sterling")) return { key: "sterling", logo: "/images/bank/sterling-logo.svg" };
  return { key: normalized, logo: null };
}

export type PaymentAccount = { bank_name: string; account_number: string; account_name: string };

export function paymentAccountKey(account: Pick<PaymentAccount, "bank_name" | "account_number">) {
  return `${bankIdentity(account.bank_name).key}:${account.account_number}`;
}

/** Preserve bank identity: two banks can issue the same account number. */
export function paymentAccounts(profile: DriverProfile): PaymentAccount[] {
  const seen = new Set<string>();
  const accounts: PaymentAccount[] = [];
  for (const main of [profile.virtual_account, profile.user.virtual_account]) {
    if (!main) continue;
    for (const item of [main, ...(main.banks ?? [])]) {
      if (!item.account_number) continue;
      const key = paymentAccountKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      accounts.push({ ...item, account_name: main.account_name });
    }
  }
  return accounts;
}
