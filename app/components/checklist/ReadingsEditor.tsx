"use client";

import { useState } from "react";
import { BatteryMedium, Fuel, Gauge, PlugZap, Route, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../../lib/api";
import { useUpdateDashboard } from "../../lib/queries";
import type { DailyChecklist, DashboardReading, DashboardWarning } from "../../lib/types";
import { TextField } from "../FormControls";
import { Modal } from "../Modal";
import { Spinner } from "../Ui";

const toText = (value: number | null | undefined) => (value == null ? "" : String(value));
const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));
const snake = (label: string) => label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50);

function Form({ checklist, onClose }: { checklist: DailyChecklist; onClose: () => void }) {
  const current: DashboardReading = checklist.dashboard?.effective ?? {};
  const electric = current.is_electric !== false;
  const mutation = useUpdateDashboard(checklist.id);

  const [odometer, setOdometer] = useState(toText(current.odometer_km));
  const [battery, setBattery] = useState(toText(current.battery_percent));
  const [range, setRange] = useState(toText(current.range_km));
  const [fuel, setFuel] = useState(toText(current.fuel_level_percent));
  const [charging, setCharging] = useState(current.is_charging ?? false);
  const [warnings, setWarnings] = useState<DashboardWarning[]>(current.warnings ?? []);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addWarning = () => {
    const label = draft.trim();
    const code = snake(label);
    if (!code || warnings.some((w) => w.code === code)) return setDraft("");
    setWarnings([...warnings, { code, label, severity: "WARNING" }]);
    setDraft("");
  };

  const save = () => {
    const next: Record<string, string> = {};
    const check = (key: string, text: string, max?: number) => {
      const value = toNumber(text);
      if (value !== null && (Number.isNaN(value) || value < 0 || (max !== undefined && value > max))) {
        next[key] = max ? `Enter a number from 0 to ${max}.` : "Enter a valid number.";
      }
    };
    check("odometer_km", odometer);
    if (electric) {
      check("battery_percent", battery, 100);
      check("range_km", range);
    } else check("fuel_level_percent", fuel, 100);
    setErrors(next);
    if (Object.keys(next).length) return;

    // Send only what changed; anything untouched keeps the AI's reading.
    const body: DashboardReading = {};
    const diff = <K extends keyof DashboardReading>(key: K, value: DashboardReading[K]) => {
      if (JSON.stringify(value) !== JSON.stringify(current[key] ?? null)) body[key] = value;
    };
    diff("odometer_km", toNumber(odometer));
    if (electric) {
      diff("battery_percent", toNumber(battery));
      diff("range_km", toNumber(range));
      diff("is_charging", charging);
    } else diff("fuel_level_percent", toNumber(fuel));
    if (JSON.stringify(warnings) !== JSON.stringify(current.warnings ?? [])) body.warnings = warnings;

    if (!Object.keys(body).length) return onClose();
    mutation.mutate(body, {
      onSuccess: () => {
        toast.success("Readings updated");
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors);
        else toast.error(error.message);
      },
    });
  };

  return (
    <form
      className="cl-editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <header>
        <h2>Edit readings</h2>
        <button className="icon-button plain" type="button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <p>Match these to what your dashboard shows right now. Leave a field empty if it isn&apos;t displayed.</p>

      <TextField error={errors.odometer_km} icon={<Gauge size={18} />} inputMode="decimal" label="Odometer (km, total)" type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} />

      {electric ? (
        <>
          <div className="cl-editor-pair">
            <TextField error={errors.battery_percent} icon={<BatteryMedium size={18} />} inputMode="decimal" label="Battery %" type="number" value={battery} onChange={(e) => setBattery(e.target.value)} />
            <TextField error={errors.range_km} icon={<Route size={18} />} inputMode="decimal" label="Range (km)" type="number" value={range} onChange={(e) => setRange(e.target.value)} />
          </div>
          <label className="cl-switch">
            <PlugZap size={18} />
            <span>The car is charging</span>
            <input checked={charging} type="checkbox" onChange={(e) => setCharging(e.target.checked)} />
            <i aria-hidden="true" />
          </label>
        </>
      ) : (
        <TextField error={errors.fuel_level_percent} icon={<Fuel size={18} />} inputMode="decimal" label="Fuel level %" type="number" value={fuel} onChange={(e) => setFuel(e.target.value)} />
      )}

      <div className="cl-warnings">
        <div className="field-top">
          <span>Warning lights on</span>
        </div>
        {warnings.length ? (
          <ul>
            {warnings.map((w) => (
              <li key={w.code}>
                {w.label}
                <button type="button" aria-label={`Remove ${w.label}`} onClick={() => setWarnings(warnings.filter((x) => x.code !== w.code))}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No warning lights.</p>
        )}
        <div className="cl-warning-add">
          <input
            aria-label="Add a warning light"
            maxLength={50}
            placeholder="Add one, e.g. Tyre pressure"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addWarning();
              }
            }}
          />
          <button type="button" aria-label="Add warning" disabled={!snake(draft)} onClick={addWarning}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="confirm-actions">
        <button className="primary-button" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? <Spinner /> : null} Save changes
        </button>
        <button className="ghost-button" disabled={mutation.isPending} type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ReadingsEditor({ checklist, open, onClose }: { checklist: DailyChecklist; open: boolean; onClose: () => void }) {
  return (
    <Modal label="Edit readings" open={open} onClose={onClose} panelClassName="cl-editor-panel">
      <Form checklist={checklist} onClose={onClose} />
    </Modal>
  );
}
