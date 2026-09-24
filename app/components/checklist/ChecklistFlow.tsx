"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, Check, CircleAlert, Clock, Lock, MapPin, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { clock, windowLabel } from "../../lib/journey";
import { usePhotoUploads, type PhotoState } from "../../lib/photos";
import { useStartChecklist, useSubmitChecklist, useTodayChecklists } from "../../lib/queries";
import type { ChecklistPhase, ChecklistPhaseName, DailyChecklist, ImageType } from "../../lib/types";
import { Spinner } from "../Ui";
import { CarGuide, PHASE_COPY, SHOTS } from "./config";
import { ChecklistResult } from "./ChecklistResult";

type View = { k: "intro" } | { k: "step"; i: number } | { k: "review" } | { k: "result" };

const hasImage = (checklist: DailyChecklist, type: ImageType) => !checklist.missing_images.includes(type);

function imageUrl(checklist: DailyChecklist, type: ImageType, photo?: PhotoState) {
  return photo?.preview ?? checklist.images.find((image) => image.image_type === type)?.url ?? null;
}

/* ---------------------------------------------------------------- */
/* Progress                                                          */
/* ---------------------------------------------------------------- */
function Progress({
  required,
  checklist,
  view,
  onGo,
}: {
  required: ImageType[];
  checklist: DailyChecklist;
  view: View;
  onGo: (view: View) => void;
}) {
  const firstMissing = required.findIndex((type) => !hasImage(checklist, type));
  const reach = firstMissing === -1 ? required.length : firstMissing;
  const allDone = firstMissing === -1;

  return (
    <nav className="cl-progress" aria-label="Checklist progress">
      {required.map((type, i) => {
        const done = hasImage(checklist, type);
        const current = view.k === "step" && view.i === i;
        return (
          <button
            aria-current={current ? "step" : undefined}
            aria-label={`${SHOTS[type].label}${done ? ", done" : ""}`}
            className={`${done ? "done" : ""} ${current ? "current" : ""}`}
            disabled={i > reach}
            key={type}
            type="button"
            onClick={() => onGo({ k: "step", i })}
          />
        );
      })}
      <button
        aria-current={view.k === "review" ? "step" : undefined}
        aria-label="Review"
        className={view.k === "review" ? "current" : ""}
        disabled={!allDone}
        type="button"
        onClick={() => onGo({ k: "review" })}
      />
    </nav>
  );
}

/* ---------------------------------------------------------------- */
/* Intro                                                             */
/* ---------------------------------------------------------------- */
function Intro({ phase, info, required }: { phase: ChecklistPhaseName; info: ChecklistPhase; required: ImageType[] }) {
  const copy = PHASE_COPY[phase];
  const start = useStartChecklist();
  const closed = info.state === "CLOSED";

  const blocked = info.can_start
    ? null
    : info.state === "UPCOMING"
      ? `This opens at ${clock(info.window.start_time)}.`
      : closed
        ? `The ${copy.name.toLowerCase()} window closed at ${clock(info.window.end_time)}.`
        : "You don't have a vehicle assigned yet.";

  return (
    <div className="cl-card cl-intro">
      <span className="cl-intro-icon">
        <ShieldCheck size={30} />
      </span>
      <h2>{copy.name} checklist</h2>
      <p>{copy.intro}</p>

      <ul className="cl-chips">
        {required.map((type) => (
          <li key={type}>{SHOTS[type].label}</li>
        ))}
      </ul>

      <ul className="cl-facts">
        <li>
          <Clock size={17} />
          <span>
            Window <b>{windowLabel(info.window)}</b>
          </span>
        </li>
        <li>
          <MapPin size={17} />
          <span>
            {info.location ? (
              <>
                Be within <b>{info.location.radius_meters} m</b> of {info.location.address ?? "the pick-up point"}
              </>
            ) : (
              "You can do this from anywhere"
            )}
          </span>
        </li>
      </ul>

      {blocked ? (
        <div className="cl-notice">
          <Lock size={16} /> {blocked}
          {closed && phase === "PICK_UP" ? " You can ask for a new pick-up time from the home screen." : ""}
        </div>
      ) : null}

      {start.error ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {start.error.message}
        </div>
      ) : null}

      {info.can_start ? (
        <button className="primary-button" disabled={start.isPending} type="button" onClick={() => start.mutate(phase)}>
          {start.isPending ? <Spinner /> : <MapPin size={19} />} {start.isPending ? "Checking your location…" : "Start checklist"}
        </button>
      ) : (
        <Link className="ghost-button" href="/">
          Back to home
        </Link>
      )}
      {info.can_start ? <small className="cl-fine">We&apos;ll ask for your location to confirm you&apos;re at the right place.</small> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* One photo per page                                                */
/* ---------------------------------------------------------------- */
function PhotoStep({
  index,
  total,
  type,
  checklist,
  photo,
  onCapture,
  onRetry,
  onBack,
  onNext,
}: {
  index: number;
  total: number;
  type: ImageType;
  checklist: DailyChecklist;
  photo?: PhotoState;
  onCapture: (file: File) => void;
  onRetry: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const shot = SHOTS[type];
  const src = imageUrl(checklist, type, photo);
  const busy = photo?.status === "processing" || photo?.status === "uploading";
  const failed = photo?.status === "error";
  const saved = hasImage(checklist, type);
  const canContinue = saved && !busy && !failed;
  const last = index === total - 1;
  const allSaved = checklist.missing_images.length === 0; // editing from the review page: go straight back

  return (
    <div className="cl-card cl-step" key={type}>
      <div className="cl-step-head">
        <small>
          Photo {index + 1} of {total}
        </small>
        <h2>{shot.title}</h2>
      </div>

      <div className={`cl-shot ${src ? "has" : ""}`}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`${shot.label} of the vehicle`} src={src} />
        ) : (
          <div className="cl-shot-empty">
            <CarGuide side={type} />
            <span>{shot.label}</span>
          </div>
        )}

        {busy ? (
          <div className="cl-shot-busy" role="status">
            <Spinner />
            <span>{photo?.status === "processing" ? "Preparing photo…" : `Uploading ${Math.round((photo?.progress ?? 0) * 100)}%`}</span>
            <div className="cl-bar">
              <span style={{ width: `${photo?.status === "uploading" ? Math.round(photo.progress * 100) : 8}%` }} />
            </div>
          </div>
        ) : null}

        {saved && !busy && !failed ? (
          <span className="cl-saved">
            <Check size={14} strokeWidth={3} /> Saved
          </span>
        ) : null}
      </div>

      {failed ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {photo?.error}
        </div>
      ) : (
        <p className="cl-tip">{shot.tip}</p>
      )}

      <input
        accept="image/*"
        capture="environment"
        className="cl-file"
        ref={input}
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onCapture(file);
        }}
      />

      <div className="cl-actions">
        {failed && photo?.preview ? (
          <button className="primary-button" type="button" onClick={onRetry}>
            <RefreshCw size={18} /> Try upload again
          </button>
        ) : canContinue ? (
          <button className="primary-button" type="button" onClick={onNext}>
            {allSaved ? "Back to review" : last ? "Review photos" : "Next photo"} <ArrowRight size={19} />
          </button>
        ) : (
          <button className="primary-button" disabled={busy} type="button" onClick={() => input.current?.click()}>
            <Camera size={19} /> Take photo
          </button>
        )}

        <div className="cl-actions-row">
          {index > 0 ? (
            <button className="ghost-button" disabled={busy} type="button" onClick={onBack}>
              <ArrowLeft size={18} /> Back
            </button>
          ) : null}
          {saved || failed ? (
            <button className="ghost-button" disabled={busy} type="button" onClick={() => input.current?.click()}>
              <Camera size={18} /> Retake
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Review before submitting                                          */
/* ---------------------------------------------------------------- */
function Review({
  phase,
  required,
  checklist,
  photos,
  onEdit,
  onSubmitted,
}: {
  phase: ChecklistPhaseName;
  required: ImageType[];
  checklist: DailyChecklist;
  photos: Partial<Record<ImageType, PhotoState>>;
  onEdit: (i: number) => void;
  onSubmitted: () => void;
}) {
  const copy = PHASE_COPY[phase];
  const submit = useSubmitChecklist(checklist.id);

  return (
    <div className="cl-card cl-review">
      <div className="cl-step-head">
        <small>Almost done</small>
        <h2>Review your photos</h2>
      </div>
      <p className="cl-tip">Happy with them? Tap any photo to retake it. Once you submit, photos are locked.</p>

      <ul className="cl-grid">
        {required.map((type, i) => {
          const src = imageUrl(checklist, type, photos[type]);
          return (
            <li key={type}>
              <button type="button" aria-label={`Retake ${SHOTS[type].label}`} onClick={() => onEdit(i)}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={SHOTS[type].label} src={src} />
                ) : (
                  <span className="cl-grid-empty">
                    <Camera size={20} />
                  </span>
                )}
                <em>
                  {SHOTS[type].label} <Pencil size={11} />
                </em>
              </button>
            </li>
          );
        })}
      </ul>

      {submit.error ? (
        <div className="cl-notice bad" role="alert">
          <CircleAlert size={16} /> {submit.error.message}
        </div>
      ) : null}

      <button
        className="primary-button"
        disabled={submit.isPending}
        type="button"
        onClick={() =>
          submit.mutate(undefined, {
            onSuccess: () => {
              toast.success(copy.doneTitle);
              onSubmitted();
            },
          })
        }
      >
        {submit.isPending ? <Spinner /> : <Check size={19} />} {submit.isPending ? "Submitting…" : copy.submitLabel}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Orchestrator                                                      */
/* ---------------------------------------------------------------- */
export function ChecklistFlow({ phase }: { phase: ChecklistPhaseName }) {
  const today = useTodayChecklists();
  const data = today.data?.data ?? null;
  const info = data?.phases.find((p) => p.phase === phase) ?? null;
  const checklist = info?.checklist ?? null;
  const required = (data?.required_images ?? []) as ImageType[];
  const uploads = usePhotoUploads(checklist?.id);
  const [nav, setNav] = useState<View | null>(null);

  if (today.isPending) return <div className="cl-card cl-skeleton" aria-busy="true" aria-label="Loading checklist" />;

  if (!data || !info) {
    return (
      <div className="cl-card cl-intro">
        <CircleAlert size={30} />
        <h2>{data ? "Nothing to do here yet" : "Couldn't load your checklist"}</h2>
        <p>{data ? "You don't have a vehicle assigned yet." : "Check your connection and try again."}</p>
        {data ? (
          <Link className="ghost-button" href="/">
            Back to home
          </Link>
        ) : (
          <button className="primary-button" type="button" onClick={() => void today.refetch()}>
            Try again
          </button>
        )}
      </div>
    );
  }

  // Where to be right now: the server's state decides, and `nav` only overrides while the driver moves around.
  const derived: View = !checklist
    ? { k: "intro" }
    : checklist.status === "SUBMITTED"
      ? { k: "result" }
      : checklist.missing_images.length === 0
        ? { k: "review" }
        : { k: "step", i: Math.max(0, required.findIndex((type) => checklist.missing_images.includes(type))) };
  const view: View = checklist?.status === "SUBMITTED" ? { k: "result" } : !checklist ? { k: "intro" } : (nav ?? derived);

  if (view.k === "intro" || !checklist) return <Intro info={info} phase={phase} required={required} />;
  if (view.k === "result") return <ChecklistResult checklist={checklist} phase={phase} />;

  const go = (next: View) => {
    setNav(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="cl-flow">
      <Progress checklist={checklist} required={required} view={view} onGo={go} />

      {view.k === "step" ? (
        <PhotoStep
          checklist={checklist}
          index={view.i}
          photo={uploads.photos[required[view.i]]}
          total={required.length}
          type={required[view.i]}
          onBack={() => go({ k: "step", i: view.i - 1 })}
          onCapture={(file) => void uploads.capture(required[view.i], file)}
          onNext={() => go(checklist.missing_images.length === 0 || view.i + 1 >= required.length ? { k: "review" } : { k: "step", i: view.i + 1 })}
          onRetry={() => uploads.retry(required[view.i])}
        />
      ) : (
        <Review
          checklist={checklist}
          phase={phase}
          photos={uploads.photos}
          required={required}
          onEdit={(i) => go({ k: "step", i })}
          onSubmitted={() => go({ k: "result" })}
        />
      )}
    </div>
  );
}
