"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AtSign, Briefcase, Check, IdCard, Mail, ShieldCheck, User, X } from "lucide-react";
import { toast } from "sonner";
import { PhoneField, SegmentedControl, TextField } from "../components/FormControls";
import { ScreenBar, ScreenTitle, Spinner } from "../components/Ui";
import { ApiError, type FieldErrors } from "../lib/api";
import { countries } from "../lib/countries";
import { useSubmitApplication, useUsernameAvailability, useUsernameSuggestions } from "../lib/queries";

type KycMode = "nin" | "bvn";

export default function ApplyPage() {
  const router = useRouter();
  const submit = useSubmitApplication();
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const suggestions = useUsernameSuggestions(form.firstName, form.lastName).data ?? [];
  const usernameState = useUsernameAvailability(form.username);

  const phoneNumber = useMemo(() => {
    const digits = form.phoneLocal.replace(/\D/g, "").replace(/^0+/, "");
    return digits ? `${country.code}${digits}` : "";
  }, [form.phoneLocal, country.code]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    const localErrors: FieldErrors = {};
    if (!form.email && !phoneNumber) localErrors.phone_number = "Add an email or phone number.";
    if (!form.bvn && !form.nin) localErrors.nin = "Add either your BVN or NIN.";
    if (form.bvn && !/^\d{11}$/.test(form.bvn)) localErrors.bvn = "BVN must be 11 digits.";
    if (form.nin && !/^\d{11}$/.test(form.nin)) localErrors.nin = "NIN must be 11 digits.";
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }

    submit.mutate(
      {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        username: form.username.trim(),
        email: form.email.trim() || null,
        phone_number: phoneNumber || null,
        years_of_experience: Number(form.experience || 0),
        driver_license_number: form.license.trim() || null,
        bvn: form.bvn || null,
        nin: form.nin || null,
      },
      {
        onSuccess: () => router.push("/apply/success"),
        onError: (error) => {
          if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
          toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
        },
      },
    );
  }

  const usernameTrailing =
    usernameState === "checking" ? (
      <Spinner />
    ) : usernameState === "ok" ? (
      <span className="status-dot ok"><Check size={14} strokeWidth={3} /></span>
    ) : usernameState === "taken" ? (
      <span className="status-dot bad"><X size={14} strokeWidth={3} /></span>
    ) : null;

  return (
    <div className="screen-enter">
      <ScreenBar />
      <form autoComplete="off" className="form" onSubmit={handleSubmit}>
        <ScreenTitle title="Apply to drive">Tell us about yourself. We&apos;ll reach out by SMS or email after review.</ScreenTitle>

        <TextField icon={<User size={18} />} label="First name" placeholder="Chinedu" required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
        <TextField icon={<User size={18} />} label="Last name" placeholder="Okafor" required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />

        <TextField
          autoCapitalize="none"
          error={fieldErrors.username}
          hint={usernameState === "ok" ? "Nice, that username is available." : usernameState === "taken" ? "This username is already taken." : "Letters, numbers, dots and underscores."}
          hintTone={usernameState === "ok" ? "success" : usernameState === "taken" ? "danger" : "default"}
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

        <TextField error={fieldErrors.email} icon={<Mail size={18} />} inputMode="email" label="Email" placeholder="chinedu.okafor@gmail.com" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />

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
          <button className="primary-button" disabled={submit.isPending || submit.isSuccess || usernameState === "taken"} type="submit">
            {submit.isPending ? <Spinner /> : null}
            {submit.isPending ? "Submitting…" : "Submit application"}
            {!submit.isPending ? <ArrowRight size={18} /> : null}
          </button>
          <Link className="text-button" href="/login">
            Already approved? <strong>Sign in</strong>
          </Link>
        </div>
      </form>
    </div>
  );
}
