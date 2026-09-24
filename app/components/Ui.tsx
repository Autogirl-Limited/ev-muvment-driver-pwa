"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** Top row of a screen: optional back link on the left, theme toggle on the right. */
export function ScreenBar({ backHref, backLabel = "Back" }: { backHref?: string; backLabel?: string }) {
  return (
    <div className="screen-bar">
      {backHref ? (
        <Link className="back-link" href={backHref}>
          <ArrowLeft size={18} /> {backLabel}
        </Link>
      ) : (
        <span />
      )}
      <ThemeToggle />
    </div>
  );
}

export function ScreenTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="screen-title">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function strength(value: string) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score++;
  return value ? Math.max(score, 1) : 0;
}

export function StrengthMeter({ value }: { value: string }) {
  const score = strength(value);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return (
    <div className={`strength level-${score}`} aria-live="polite">
      <div className="strength-bars">
        {[1, 2, 3, 4].map((step) => (
          <span className={score >= step ? "on" : ""} key={step} />
        ))}
      </div>
      <small>{score ? `${labels[score]} password` : "Use at least 8 characters."}</small>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
