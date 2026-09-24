"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, House, WalletCards, Zap } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/payment", label: "Payment", icon: WalletCards },
  { href: "/charge", label: "Charge", icon: Zap },
  { href: "/checklist", label: "Checklist", icon: ClipboardCheck },
];

export function BottomNav() {
  const pathname = usePathname();
  // Highlight the tapped tab immediately instead of waiting for the route to finish loading.
  // Keyed to the pathname it was set on, so it stops applying the moment the route changes.
  const [tapped, setTapped] = useState<{ from: string; to: string } | null>(null);
  const current = tapped && tapped.from === pathname ? tapped.to : pathname;

  const isActive = (href: string) => (href === "/" ? current === "/" : current === href || current.startsWith(`${href}/`));

  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`nav-item ${active ? "active" : ""}`}
            href={href}
            key={href}
            onPointerDown={() => setTapped({ from: pathname, to: href })}
          >
            <span className="nav-pill">
              <Icon size={23} strokeWidth={active ? 2.5 : 1.9} />
            </span>
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
