"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AtSign, Briefcase, Check, IdCard, Mail, ShieldCheck, User, X } from "lucide-react";
import { PhoneField, SegmentedControl, TextField } from "../components/FormControls";
import { Toast, useNotice } from "../components/Toast";
import { ScreenBar, ScreenTitle, Spinner } from "../components/Ui";
import { ApiError, checkUsername, submitApplication, suggestUsernames, type FieldErrors } from "../lib/api";
import { countries } from "../lib/countries";

type KycMode = "nin" | "bvn";
type UsernameState = "idle" | "checking" | "ok" | "taken";

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,50}$/;

export default function ApplyPage() {
  const router = useRouter();
  const [notice, setNotice] = useNotice();
  const [country, setCountry] = useState(countries[0]);
  const [kycMode, setKycMode] = useState<KycMode>("nin");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phoneLocal: "",
    experience: "",
    license: "",
    bvn: "",
    nin: "",
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [usernameState, setUsernameState] = useState<UsernameState>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!form.firstName || !form.lastName) {
        setSuggestions([]);
        return;
      }
      try {
        setSuggestions(await suggestUsernames(form.firstName, form.lastName));
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.firstName, form.lastName]);

  useEffect(() => {
    const username = form.username.trim();
    if (!USERNAME_RE.test(username)) return;
    const timer = window.setTimeout(async () => {
      setUsernameState("checking");
      try {
        setUsernameState((await checkUsername(username)) ? "ok" : "taken");
      } catch {
        setUsernameState("idle");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [form.username]);

  const phoneNumber = useMemo(() => {
    const digits = form.phoneLocal.replace(/\D/g, "").replace(/^0+/, "");
    return digits ? `${country.code}${digits}` : "";
  }, [form.phoneLocal, country.code]);
  const shownUsernameState: UsernameState = USERNAME_RE.test(form.username.trim()) ? usernameState : "idle";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setFieldErrors({});
    const localErrors: FieldErrors = {};
    if (!form.email && !phoneNumber) localErrors.phone_number = "Add an email or phone number.";
    if (!form.bvn && !form.nin) localErrors.nin = "Add either your BVN or NIN.";
    if (form.bvn && !/^\d{11}$/.test(form.bvn)) localErrors.bvn = "BVN must be 11 digits.";
    if (form.nin && !/^\d{11}$/.test(form.nin)) localErrors.nin = "NIN must be 11 digits.";
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      return;
    }

    setLoading(true);
    try {
      await submitApplication({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        username: form.username.trim(),
        email: form.email.trim() || null,
        phone_number: phoneNumber || null,
        years_of_experience: Number(form.experience || 0),
        driver_license_number: form.license.trim() || null,
        bvn: form.bvn || null,
        nin: form.nin || null,
      });
      router.push("/apply/success");
    } catch (error) {
      if (error instanceof ApiError) {
        setNotice({ text: error.message, tone: "error" });
        setFieldErrors(error.fieldErrors);
      } else {
        setNotice({ text: "Something went wrong. Please try again.", tone: "error" });
      }
      setLoading(false);
    }
  }

  const usernameTrailing =
    shownUsernameState === "checking" ? (
      <Spinner />
    ) : shownUsernameState === "ok" ? (
      <span className="status-dot ok"><Check size={14} strokeWidth={3} /></span>
    ) : shownUsernameState === "taken" ? (
      <span className="status-dot bad"><X size={14} strokeWidth={3} /></span>
    ) : null;

  return (
    <div className="screen-enter">
      <ScreenBar />
      <Toast notice={notice} onClose={() => setNotice(null)} />
      <form className="form" onSubmit={handleSubmit}>
        <ScreenTitle title="Apply to drive">Tell us about yourself. We&apos;ll reach out by SMS or email after review.</ScreenTitle>

        <TextField autoComplete="given-name" icon={<User size={18} />} label="First name" placeholder="Chinedu" required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
        <TextField autoComplete="family-name" icon={<User size={18} />} label="Last name" placeholder="Okafor" required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />

        <TextField
          autoCapitalize="none"
          autoComplete="username"
          error={fieldErrors.username}
          hint={shownUsernameState === "ok" ? "Nice, that username is available." : shownUsernameState === "taken" ? "This username is already taken." : "Letters, numbers, dots and underscores."}
          hintTone={shownUsernameState === "ok" ? "success" : shownUsernameState === "taken" ? "danger" : "default"}
          icon={<AtSign size={18} />}
          label="Username"
          pattern="[A-Za-z0-9_.]{3,50}"
          placeholder="chinedu.okafor"
          required
          trailing={usernameTrailing}
          value={form.username}
          onChange={(e) => update("username", e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))}
        />
        {suggestions.length ? (
          <div className="suggestions" aria-label="Username suggestions">
            <span>Try</span>
            <div className="suggestion-row">
              {suggestions.slice(0, 4).map((name) => (
                <button key={name} type="button" onClick={() => update("username", name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <TextField autoComplete="email" error={fieldErrors.email} icon={<Mail size={18} />} inputMode="email" label="Email" placeholder="chinedu.okafor@gmail.com" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />

        <PhoneField
          country={country}
          error={fieldErrors.phone_number}
          hint={phoneNumber ? `Saved as ${phoneNumber}` : "Add an email or a phone number."}
          label="Phone number"
          value={form.phoneLocal}
          onChange={(value) => update("phoneLocal", value)}
          onCountryChange={setCountry}
        />

        <TextField error={fieldErrors.years_of_experience} icon={<Briefcase size={18} />} inputMode="numeric" label="Years of driving experience" max={80} min={0} placeholder="5" required type="number" value={form.experience} onChange={(e) => update("experience", e.target.value)} />
        <TextField autoCapitalize="characters" error={fieldErrors.driver_license_number} icon={<IdCard size={18} />} label="Driver’s licence number" placeholder="ABC123456789 (optional)" value={form.license} onChange={(e) => update("license", e.target.value.toUpperCase())} />

        <div className="field">
          <div className="field-top"><span>Verify your identity</span></div>
          <SegmentedControl label="KYC type" value={kycMode} onChange={setKycMode} options={[{ value: "nin", label: "NIN" }, { value: "bvn", label: "BVN" }]} />
        </div>
        {kycMode === "nin" ? (
          <TextField error={fieldErrors.nin} icon={<ShieldCheck size={18} />} inputMode="numeric" label="National Identification Number" maxLength={11} placeholder="12345678901" value={form.nin} onChange={(e) => update("nin", e.target.value.replace(/\D/g, ""))} />
        ) : (
          <TextField error={fieldErrors.bvn} icon={<ShieldCheck size={18} />} inputMode="numeric" label="Bank Verification Number" maxLength={11} placeholder="22123456789" value={form.bvn} onChange={(e) => update("bvn", e.target.value.replace(/\D/g, ""))} />
        )}
        <p className="fine-print">Used only for bank account setup. It is not stored in this app after submission.</p>

        <div className="form-actions">
          <button className="primary-button" disabled={loading || shownUsernameState === "taken"} type="submit">
            {loading ? <Spinner /> : null}
            {loading ? "Submitting…" : "Submit application"}
            {!loading ? <ArrowRight size={18} /> : null}
          </button>
          <Link className="text-button" href="/login">
            Already approved? <strong>Sign in</strong>
          </Link>
        </div>
      </form>
    </div>
  );
}
