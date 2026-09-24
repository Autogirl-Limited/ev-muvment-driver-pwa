import Image from "next/image";
import { Building2 } from "lucide-react";
import { bankIdentity } from "../lib/banks";
import styles from "./BankAccounts.module.css";

/** Logos sit on a light surface to preserve the supplied brand colors in either theme. */
export function BankLogo({ name }: { name: string }) {
  const { logo } = bankIdentity(name);
  return (
    <span className={styles.logo}>
      {logo ? <Image src={logo} alt={`${name} logo`} width={76} height={32} className={styles.image} />
        : <Building2 size={21} aria-label={name} />}
    </span>
  );
}
