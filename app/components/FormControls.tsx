"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { Check, ChevronDown, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { countries, flagUrl, type Country } from "../lib/countries";

function scrollIntoViewSoon(element: HTMLElement) {
  setTimeout(() => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 160);
}

function FieldMessage({ error, hint, hintTone = "default" }: { error?: string; hint?: ReactNode; hintTone?: string }) {
  if (error) {
    return (
      <span className="field-message" role="alert">
        <TriangleAlert size={14} /> {error}
      </span>
    );
  }
  return hint ? <span className={`field-hint tone-${hintTone}`}>{hint}</span> : null;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  hintTone?: "default" | "success" | "danger";
  icon?: ReactNode;
  action?: ReactNode;
  trailing?: ReactNode;
};

export function TextField({
  label,
  error,
  hint,
  hintTone,
  icon,
  action,
  trailing,
  className = "",
  type,
  onFocus,
  ...props
}: TextFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={`field ${error ? "field-error" : ""} ${className}`}>
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      <div className="field-shell">
        {icon ? <span className="field-icon">{icon}</span> : null}
        <input
          {...props}
          id={id}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={error ? true : undefined}
          onFocus={(event) => {
            onFocus?.(event);
            scrollIntoViewSoon(event.currentTarget);
          }}
        />
        {trailing ? <span className="field-trailing">{trailing}</span> : null}
        {isPassword ? (
          <button
            aria-label={revealed ? "Hide password" : "Show password"}
            className="field-toggle"
            type="button"
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        ) : null}
      </div>
      <FieldMessage error={error} hint={hint} hintTone={hintTone} />
    </div>
  );
}

/** Phone number input with the country picker (flag + dial code) built into the same field. */
export function PhoneField({
  label,
  country,
  onCountryChange,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  country: Country;
  onCountryChange: (country: Country) => void;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`field phone-field ${error ? "field-error" : ""}`} ref={rootRef}>
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
      </div>
      <div className="field-shell">
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Country: ${country.label} ${country.code}`}
          className="country-trigger"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <Flag iso={country.iso} />
          <span>{country.code}</span>
          <ChevronDown className={open ? "flip" : ""} size={16} />
        </button>
        <input
          autoComplete="tel-national"
          id={id}
          inputMode="tel"
          placeholder={country.example}
          type="tel"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d\s-]/g, ""))}
          onFocus={(event) => scrollIntoViewSoon(event.currentTarget)}
        />
      </div>
      {open ? (
        <ul className="country-menu" ref={menuRef} role="listbox" aria-label="Choose country">
          {countries.map((item) => (
            <li key={item.iso} role="option" aria-selected={item.iso === country.iso}>
              <button
                type="button"
                onClick={() => {
                  onCountryChange(item);
                  setOpen(false);
                }}
              >
                <Flag iso={item.iso} lazy />
                <span className="country-name">{item.label}</span>
                <span className="country-code">{item.code}</span>
                {item.iso === country.iso ? <Check size={16} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <FieldMessage error={error} hint={hint} />
    </div>
  );
}

function Flag({ iso, lazy = false }: { iso: string; lazy?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny CDN flag, no optimisation needed
    <img
      alt=""
      className="flag"
      height={18}
      loading={lazy ? "lazy" : "eager"}
      src={flagUrl(iso, 40)}
      srcSet={`${flagUrl(iso, 40)} 1x, ${flagUrl(iso, 80)} 2x`}
      width={26}
    />
  );
}

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
};

export function SegmentedControl<T extends string>({ label, value, onChange, options }: SegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const style = { "--count": options.length, "--index": index } as CSSProperties;

  return (
    <div className="segmented-group" role="radiogroup" aria-label={label} style={style}>
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          aria-checked={value === option.value}
          className={value === option.value ? "selected" : ""}
          key={option.value}
          role="radio"
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
