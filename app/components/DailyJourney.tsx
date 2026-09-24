"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, CarFront, Check, CircleAlert, Flag, Hourglass, Lock, Play, Route, TriangleAlert } from "lucide-react";
import { useMyPickupRequests, useTodayChecklists } from "../lib/queries";
import { clock, journeyOf, requestForToday, splitDuration, spoken, windowLabel, type PhaseView, type Stage } from "../lib/journey";
import type { PickupRequest } from "../lib/types";
import { PickupRequestDialog } from "./PickupRequestDialog";

const PICKUP_HREF = "/checklist/pick-up";
const DROPOFF_HREF = "/checklist/drop-off";
const URGENT_MS = 15 * 60_000;

type Tone = "blue" | "warn" | "danger" | "success";

type Hero = {
  tone: Tone;
  eyebrow: string;
  title: string;
  sub: ReactNode;
  clock?: { label: string; ms: number; up?: boolean; progress?: number };
  cta?: { label: string; href?: string; disabled?: boolean };
  waiting?: boolean;
};

/** Ticks once a second; the caller adds the server offset so the phone's own clock never decides anything. */
function useTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

function Digits({ ms }: { ms: number }) {
  const { hours, minutes, seconds } = splitDuration(ms);
  const cells: [string, string][] = [
    [pad(hours), "hrs"],
    [pad(minutes), "min"],
    [pad(seconds), "sec"],
  ];
  return (
    <div className="jr-digits" role="timer" aria-label={spoken(ms)}>
      {cells.map(([value, unit], i) => (
        <div className="jr-digit-group" key={unit}>
          {i > 0 ? (
            <span className="jr-colon" aria-hidden="true">
              :
            </span>
          ) : null}
          <div className="jr-digit">
            <strong>{value}</strong>
            <small>{unit}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

const STEPS = ["Pick-up", "On shift", "Drop-off"] as const;

function stepStates(stage: Stage): ("done" | "current" | "todo")[] {
  switch (stage) {
    case "shift":
      return ["done", "current", "todo"];
    case "dropoff-open":
    case "dropoff-overdue":
      return ["done", "done", "current"];
    case "complete":
      return ["done", "done", "done"];
    default:
      return ["current", "todo", "todo"];
  }
}

function Stepper({ stage }: { stage: Stage }) {
  const states = stepStates(stage);
  return (
    <ol className="jr-steps" aria-label="Today's progress">
      {STEPS.map((label, i) => (
        <li className={`jr-step ${states[i]}`} key={label}>
          <span className="jr-dot">{states[i] === "done" ? <Check size={13} strokeWidth={3.2} /> : null}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function heroFor(stage: Stage, pick: PhaseView, drop: PhaseView, now: number, request: PickupRequest | null): Hero {
  switch (stage) {
    case "pickup-upcoming":
      return {
        tone: "blue",
        eyebrow: "Step 1 · Pick-up",
        title: "Your ride is almost ready",
        sub: <>Pick-up window {windowLabel(pick.phase.window)}. Be at the pick-up point when it opens.</>,
        clock: { label: "Pick-up opens in", ms: pick.start - now },
        cta: { label: `Opens at ${clock(pick.phase.window.start_time)}`, disabled: true },
      };

    case "pickup-open": {
      const over = now >= pick.end;
      const remaining = pick.end - now;
      return {
        tone: over ? "danger" : remaining < URGENT_MS ? "warn" : "blue",
        eyebrow: "Step 1 · Pick-up",
        title: over ? "Finish your pick-up now" : pick.inProgress ? "Pick up where you left off" : "Time to get moving",
        sub: over ? (
          "Your window has closed, but your checklist is still open. Finish and submit it."
        ) : remaining < URGENT_MS ? (
          "The window is closing soon. Start your checklist now."
        ) : (
          <>The pick-up window is open until {clock(pick.phase.window.end_time)}. Start your vehicle check to begin your shift.</>
        ),
        clock: over
          ? { label: "Past the window by", ms: now - pick.end, up: true }
          : { label: "Window closes in", ms: remaining, progress: (now - pick.start) / (pick.end - pick.start) },
        cta: { label: pick.inProgress ? "Resume pick-up checklist" : "Start pick-up checklist", href: PICKUP_HREF },
      };
    }

    case "pickup-missed":
      if (request?.status === "PENDING") {
        return {
          tone: "blue",
          waiting: true,
          eyebrow: "Pick-up request sent",
          title: "Waiting for approval",
          sub: (
            <>
              You asked for {clock(request.requested_start_time)} – {clock(request.requested_end_time)}. We&apos;ll update this screen the moment admin responds.
            </>
          ),
        };
      }
      return {
        tone: "warn",
        eyebrow: "Step 1 · Pick-up",
        title: "You missed the pick-up window",
        sub:
          request?.status === "REJECTED" ? (
            <>Your last request was declined{request.review_notes ? `: “${request.review_notes}”` : "."} You can send a new one.</>
          ) : (
            "No worries. Ask for a new pick-up time and once admin approves it, your checklist opens up."
          ),
        clock: { label: "Window closed", ms: now - pick.end, up: true },
        cta: { label: "Request a new pick-up time" },
      };

    case "shift": {
      const from = pick.phase.checklist?.submitted_at ? Date.parse(pick.phase.checklist.submitted_at) : pick.end;
      return {
        tone: "success",
        eyebrow: "You're on shift",
        title: "Out on the road",
        sub: "Pick-up complete. Drive safe, and bring the vehicle back within the drop-off window.",
        clock: { label: "Drop-off opens in", ms: drop.start - now, progress: (now - from) / Math.max(1, drop.start - from) },
        cta: { label: `Drop-off opens at ${clock(drop.phase.window.start_time)}`, disabled: true },
      };
    }

    case "dropoff-open": {
      const remaining = drop.end - now;
      return {
        tone: remaining < URGENT_MS ? "warn" : "blue",
        eyebrow: "Step 3 · Drop-off",
        title: drop.inProgress ? "Pick up where you left off" : "Time to bring it home",
        sub: <>Return the vehicle and complete your drop-off check before {clock(drop.phase.window.end_time)}.</>,
        clock: { label: "Drop-off closes in", ms: remaining, progress: (now - drop.start) / (drop.end - drop.start) },
        cta: { label: drop.inProgress ? "Resume drop-off checklist" : "Start drop-off checklist", href: DROPOFF_HREF },
      };
    }

    case "dropoff-overdue":
      return {
        tone: "danger",
        eyebrow: "Drop-off overdue",
        title: "You're past the drop-off time",
        sub: "Bring the vehicle back and complete your drop-off checklist as soon as you can.",
        clock: { label: "Overdue by", ms: now - drop.end, up: true },
        cta: { label: drop.inProgress ? "Resume drop-off checklist" : "Complete drop-off now", href: DROPOFF_HREF },
      };

    case "complete": {
      const at = drop.phase.checklist?.submitted_at;
      const when = at
        ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" }).format(new Date(at))
        : null;
      return {
        tone: "success",
        eyebrow: "Day complete",
        title: "Great work today",
        sub: <>Vehicle returned{when ? ` at ${when}` : ""} and your shift has ended. Rest up, we&apos;ll see you tomorrow.</>,
      };
    }

    default:
      return { tone: "blue", eyebrow: "", title: "", sub: "" };
  }
}

const HERO_ICON: Record<Tone, ReactNode> = {
  blue: <Route size={16} />,
  warn: <TriangleAlert size={16} />,
  danger: <CircleAlert size={16} />,
  success: <Flag size={16} />,
};

function PhaseRow({ view, label, icon }: { view: PhaseView; label: string; icon: ReactNode }) {
  const status = view.done
    ? "Done"
    : view.inProgress
      ? "In progress"
      : view.state === "OPEN"
        ? "Open now"
        : view.state === "UPCOMING"
          ? "Upcoming"
          : "Missed";
  const tone = view.done ? "ok" : view.state === "OPEN" || view.inProgress ? "live" : view.state === "CLOSED" ? "bad" : "idle";
  return (
    <li className="jr-row">
      <span className="jr-row-icon">{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{windowLabel(view.phase.window)}</small>
      </div>
      <span className={`jr-chip ${tone}`}>{status}</span>
    </li>
  );
}

export function DailyJourney() {
  const today = useTodayChecklists();
  const requests = useMyPickupRequests();
  const [requesting, setRequesting] = useState(false);
  const tick = useTick();

  const data = today.data?.data ?? null;
  // Server time at fetch minus the phone clock at fetch: add it to the phone clock to get "server now".
  const offset = today.data && data ? Date.parse(data.server_time) - today.data.receivedAt : 0;
  const now = tick + offset;

  const journey = useMemo(() => (data ? journeyOf(data, now) : null), [data, now]);
  const stage = journey?.stage;

  // When the local clock crosses a window boundary, ask the server so can_start and windows stay truthful.
  const lastStage = useRef<Stage | null>(null);
  const { refetch } = today;
  useEffect(() => {
    if (!stage) return;
    if (lastStage.current && lastStage.current !== stage) void refetch();
    lastStage.current = stage;
  }, [stage, refetch]);

  if (today.isPending) return <div className="jr-hero jr-skeleton" aria-busy="true" aria-label="Loading today's plan" />;

  if (!data) {
    return (
      <section className="panel">
        <h3 className="panel-title">
          <CalendarClock size={16} /> Today&apos;s plan
        </h3>
        <p className="empty">
          <CircleAlert size={18} /> We couldn&apos;t load today&apos;s plan.
        </p>
        <button className="ghost-button" type="button" onClick={() => void today.refetch()}>
          Try again
        </button>
      </section>
    );
  }

  if (!journey?.pick || !journey.drop) {
    return (
      <section className="panel">
        <h3 className="panel-title">
          <CalendarClock size={16} /> Today&apos;s plan
        </h3>
        <p className="empty">
          <CarFront size={18} /> No vehicle assigned yet. Your pick-up and drop-off will appear here once one is ready.
        </p>
      </section>
    );
  }

  const { pick, drop } = journey;
  const request = requestForToday(requests.data, data.checklist_date);
  const hero = heroFor(journey.stage, pick, drop, now, request);
  const onShift = pick.done && !drop.done;
  const missed = journey.stage === "pickup-missed";
  const canRequest = (journey.stage === "pickup-upcoming" || journey.stage === "pickup-open") && request?.status !== "PENDING";
  const cta = hero.cta;
  const ratio = hero.clock?.progress;

  return (
    <>
      <section className={`jr-hero tone-${hero.tone}`} aria-live="polite">
        <div className="jr-top">
          <span className="jr-eyebrow">
            {HERO_ICON[hero.tone]} {hero.eyebrow}
          </span>
          <span className={`jr-shift ${onShift ? "on" : ""}`}>
            <i /> {onShift ? "On shift" : "Off shift"}
          </span>
        </div>

        <h2>{hero.title}</h2>
        <p className="jr-sub">{hero.sub}</p>

        {hero.clock ? (
          <div className="jr-clock">
            <span className="jr-clock-label">
              {hero.clock.up ? <Hourglass size={14} /> : null} {hero.clock.label}
            </span>
            <Digits ms={hero.clock.ms} />
            {ratio !== undefined ? (
              <div className="jr-progress" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
              </div>
            ) : null}
          </div>
        ) : hero.waiting ? (
          <div className="jr-wait" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {cta ? (
          cta.href && !cta.disabled ? (
            <Link className="jr-cta" href={cta.href}>
              <Play size={18} fill="currentColor" /> {cta.label}
            </Link>
          ) : (
            <button className="jr-cta" disabled={cta.disabled} type="button" onClick={() => setRequesting(true)}>
              {cta.disabled ? <Lock size={17} /> : <CalendarClock size={18} />} {cta.label}
            </button>
          )
        ) : null}

        {canRequest ? (
          <button className="jr-link" type="button" onClick={() => setRequesting(true)}>
            {journey.stage === "pickup-open" ? "Running late?" : "Can't make it?"} Request another pick-up time
          </button>
        ) : null}

        <Stepper stage={journey.stage} />
      </section>

      <section className="panel jr-plan">
        <h3 className="panel-title">
          <CalendarClock size={16} /> Today&apos;s schedule
        </h3>
        <ul>
          <PhaseRow view={pick} label="Pick-up" icon={<Play size={16} />} />
          {pick.done ? <PhaseRow view={drop} label="Drop-off" icon={<Flag size={16} />} /> : null}
        </ul>
        {!pick.done ? (
          <p className="jr-note">
            <Lock size={14} /> Drop-off unlocks once your pick-up checklist is done.
          </p>
        ) : null}
        {missed && request?.status === "APPROVED" ? (
          <p className="jr-note">Your request was approved. Your new pick-up time is shown above.</p>
        ) : null}
      </section>

      <PickupRequestDialog open={requesting} onClose={() => setRequesting(false)} now={now} onSent={() => void today.refetch()} />
    </>
  );
}
