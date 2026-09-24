"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, EllipsisVertical, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { LogoutDialog } from "./LogoutDialog";
import { applyTheme, currentTheme } from "../lib/theme";

const TITLES: Record<string, string> = {
  "/payment": "Payment",
  "/charge": "Charge",
  "/checklist": "Checklist",
  "/checklist/pick-up": "Pick-up checklist",
  "/checklist/drop-off": "Drop-off checklist",
  "/profile": "Profile",
  "/notifications": "Notifications",
};

/** Pages reached from the header rather than the tab bar get a back arrow. */
const SUB_PAGES = new Set(["/profile", "/notifications", "/checklist/pick-up", "/checklist/drop-off"]);

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const firstName = useSession().data?.profile?.user.first_name;
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // The menu is tied to the route it was opened on, so navigating closes it automatically.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenOn(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isSub = SUB_PAGES.has(pathname);
  const title = TITLES[pathname];

  return (
    <header className={`app-header ${scrolled ? "scrolled" : ""}`}>
      <div className="app-header-left">
        {isSub ? (
          <button className="icon-button plain" type="button" aria-label="Back" onClick={() => router.back()}>
            <ArrowLeft size={22} />
          </button>
        ) : null}
        {title ? (
          <h1 className="app-title">{title}</h1>
        ) : (
          <Link className="hello" href="/" aria-label="Home">
            Hi, <strong>{firstName ?? "there"}</strong>
          </Link>
        )}
      </div>

      <div className="app-header-actions" ref={menuRef}>
        <Link className="icon-button plain" href="/notifications" aria-label="Notifications">
          <Bell size={22} />
        </Link>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="More options"
          className="icon-button plain"
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          <EllipsisVertical size={22} />
        </button>

        {open ? (
          <div className="menu" role="menu">
            <Link className="menu-item" href="/profile" role="menuitem" onClick={() => setOpenOn(null)}>
              <UserRound size={19} /> Profile
            </Link>
            <button
              className="menu-item"
              role="menuitem"
              type="button"
              onClick={() => {
                applyTheme(currentTheme() === "dark" ? "light" : "dark");
                setOpenOn(null);
              }}
            >
              <Moon className="only-light" size={19} />
              <Sun className="only-dark" size={19} />
              <span className="only-light">Dark mode</span>
              <span className="only-dark">Light mode</span>
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item danger"
              role="menuitem"
              type="button"
              onClick={() => {
                setOpenOn(null);
                setConfirmingLogout(true);
              }}
            >
              <LogOut size={19} /> Log out
            </button>
          </div>
        ) : null}
      </div>

      <LogoutDialog open={confirmingLogout} onClose={() => setConfirmingLogout(false)} />
    </header>
  );
}
