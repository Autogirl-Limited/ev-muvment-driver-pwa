"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BatteryMedium,
  CarFront,
  Check,
  CircleAlert,
  Fuel,
  Gauge,
  Info,
  Lock,
  Pencil,
  PlugZap,
  RefreshCw,
  Route,
  ScanSearch,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { lagosDate } from "../../lib/format";
import { useChecklistAnalysis, useReanalyze } from "../../lib/queries";
import type { ChecklistPhaseName, DailyChecklist } from "../../lib/types";
import { Modal } from "../Modal";
import { Spinner } from "../Ui";
import { PHASE_COPY, SHOTS } from "./config";
import { ReadingsEditor } from "./ReadingsEditor";

const VERDICT: Record<string, { label: string; tone: string }> = {
  NO_CHANGE: { label: "No new damage", tone: "ok" },
  MINOR_CHANGES: { label: "Minor changes", tone: "warn" },
  NEW_DAMAGE: { label: "New damage spotted", tone: "bad" },
  UNCLEAR: { label: "Couldn't tell", tone: "idle" },
};

const CONDITION: Record<string, { label: string; tone: string }> = {
  GOOD: { label: "Looks good", tone: "ok" },
  NOT_GOOD: { label: "Needs attention", tone: "warn" },
  UNCLEAR: { label: "Unclear", tone: "idle" },
};

const num = (value: number | null | undefined, unit: string) =>
  value == null ? "Not shown" : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;

function Reading({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="cl-reading">
      <span className="cl-reading-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{children}</strong>
      </div>
    </li>
  );
}

function Scanning() {
  return (
    <div className="cl-scan" role="status">
      <span className="cl-scan-icon">
        <ScanSearch size={26} />
      </span>
      <div>
        <strong>Reading your photos…</strong>
        <small>We&apos;re checking the dashboard and the car&apos;s condition. This usually takes a few seconds.</small>
      </div>
      <div className="cl-bar indeterminate">
        <span />
      </div>
    </div>
  );
}

export function ChecklistResult({
  checklist: initial,
  phase,
  history = false,
}: {
  checklist: DailyChecklist;
  phase: ChecklistPhaseName;
  /** Viewing a past checklist rather than one just submitted. */
  history?: boolean;
}) {
  const copy = PHASE_COPY[phase];
  const polled = useChecklistAnalysis(initial.id, true);
  const checklist = polled.data ?? initial;
  const reanalyze = useReanalyze(initial.id);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const status = checklist.analysis.status;
  const reading = status === "PENDING" || status === "PROCESSING" || status === "NOT_STARTED";
  const failed = status === "FAILED";
  const sameDay = checklist.checklist_date === lagosDate();
  const values = checklist.dashboard?.effective ?? null;
  const edited = Boolean(checklist.dashboard?.driver_edited_at);
  const electric = values?.is_electric !== false;
  const verdict = checklist.comparison?.verdict ? VERDICT[checklist.comparison.verdict] : null;
  const condition = checklist.condition ? CONDITION[checklist.condition.status] : null;
  const badPhotos = checklist.images.filter((image) => image.analysis?.image_valid === false);
  const dayText = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${checklist.checklist_date}T12:00:00+01:00`));
  const submittedAt = checklist.submitted_at
    ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" }).format(new Date(checklist.submitted_at))
    : null;

  return (
    <div className="cl-flow cl-result">
      <section className="cl-card cl-done">
        <span className="cl-done-icon">
          <Check size={30} strokeWidth={3} />
        </span>
        <h2>{history ? `${copy.name} · ${dayText}` : copy.doneTitle}</h2>
        <p>{history ? (submittedAt ? `Submitted at ${submittedAt}` : "Submitted") : copy.doneSub}</p>
      </section>

      {reading ? <Scanning /> : null}

      {failed ? (
        <section className="cl-card">
          <div className="cl-notice bad">
            <CircleAlert size={16} /> We couldn&apos;t read the dashboard{checklist.analysis.error ? `: ${checklist.analysis.error}` : "."}
          </div>
          <div className="cl-actions">
            <button
              className="primary-button"
              disabled={reanalyze.isPending}
              type="button"
              onClick={() => reanalyze.mutate(undefined, { onError: (e) => toast.error(e.message) })}
            >
              {reanalyze.isPending ? <Spinner /> : <RefreshCw size={18} />} Try reading again
            </button>
            {sameDay ? (
              <button className="ghost-button" type="button" onClick={() => setEditing(true)}>
                <Pencil size={18} /> Enter readings myself
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!reading && !failed ? (
        <>
          <section className="cl-card">
            <header className="cl-card-head">
              <h3>What we read from your dashboard</h3>
              {edited ? <span className="cl-tag">Edited by you</span> : null}
            </header>

            {values ? (
              <ul className="cl-readings">
                <Reading icon={<Gauge size={18} />} label="Odometer">
                  {num(values.odometer_km, " km")}
                </Reading>
                {electric ? (
                  <>
                    <Reading icon={<BatteryMedium size={18} />} label="Battery">
                      {num(values.battery_percent, "%")}
                    </Reading>
                    <Reading icon={<Route size={18} />} label="Range">
                      {num(values.range_km, " km")}
                    </Reading>
                    <Reading icon={<PlugZap size={18} />} label="Charging">
                      {values.is_charging == null ? "Not shown" : values.is_charging ? "Yes" : "No"}
                    </Reading>
                  </>
                ) : (
                  <Reading icon={<Fuel size={18} />} label="Fuel">
                    {num(values.fuel_level_percent, "%")}
                  </Reading>
                )}
                <Reading icon={<TriangleAlert size={18} />} label="Warning lights">
                  {values.warnings == null ? "Not shown" : values.warnings.length ? values.warnings.map((w) => w.label).join(", ") : "None on"}
                </Reading>
              </ul>
            ) : (
              <p className="cl-tip">We couldn&apos;t find any readings on your dashboard photo.</p>
            )}

            {sameDay ? (
              <>
                <p className="cl-tip">Something look off? You can correct any reading until midnight.</p>
                <button className="ghost-button" type="button" onClick={() => setEditing(true)}>
                  <Pencil size={18} /> Edit readings
                </button>
              </>
            ) : (
              <p className="cl-tip">
                <Lock size={13} /> Readings can only be edited on the day they were submitted.
              </p>
            )}
          </section>

          {condition || verdict ? (
            <section className="cl-card">
              <header className="cl-card-head">
                <h3>{verdict ? "Compared with pick-up" : "Vehicle condition"}</h3>
                <span className={`cl-tag ${(verdict ?? condition)?.tone}`}>{(verdict ?? condition)?.label}</span>
              </header>
              {checklist.condition?.summary ? <p className="cl-tip">{checklist.condition.summary}</p> : null}
              {checklist.comparison?.new_damage?.length ? (
                <ul className="cl-damage">
                  {checklist.comparison.new_damage.map((item, i) => (
                    <li key={i}>
                      <b>{item.side}</b> · {item.description}
                    </li>
                  ))}
                </ul>
              ) : null}
              {checklist.comparison?.dashboard_changes?.distance_driven_km != null ? (
                <p className="cl-tip">
                  <CarFront size={13} /> You drove {num(checklist.comparison.dashboard_changes.distance_driven_km, " km")} today.
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {badPhotos.length ? (
        <div className="cl-notice">
          <Info size={16} /> {badPhotos.map((p) => SHOTS[p.image_type].label).join(", ")}{" "}
          {badPhotos.length === 1 ? "was" : "were"} hard to read. Photos are locked now, but staff have been told.
        </div>
      ) : null}

      <section className="cl-card">
        <header className="cl-card-head">
          <h3>Your photos</h3>
          <span className="cl-tag idle">
            <Lock size={11} /> Locked
          </span>
        </header>
        <ul className="cl-grid small">
          {checklist.images.map((image) => (
            <li key={image.image_type}>
              <button disabled={!image.url} type="button" onClick={() => setViewing(image.image_type)}>
                {image.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={SHOTS[image.image_type].label} src={image.url} />
                ) : (
                  <span className="cl-grid-empty" />
                )}
                <em>{SHOTS[image.image_type].label}</em>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Link className="primary-button" href={history ? "/checklist" : "/"}>
        {history ? "Back to checklists" : "Back to home"}
      </Link>

      <ReadingsEditor checklist={checklist} open={editing} onClose={() => setEditing(false)} />

      <Modal label="Photo" open={viewing !== null} onClose={() => setViewing(null)} panelClassName="cl-viewer">
        {viewing ? (
          <>
            <button className="icon-button plain cl-viewer-close" type="button" aria-label="Close" onClick={() => setViewing(null)}>
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={checklist.images.find((i) => i.image_type === viewing)?.url ?? ""} />
          </>
        ) : null}
      </Modal>
    </div>
  );
}
