"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, CircleAlert, Clock, Eye, Flag, Hourglass, Lock, Play, Siren, Timer } from "lucide-react";
import { clock, journeyOf, requestForToday, spoken, windowLabel, type PhaseView } from "../../lib/journey";
import { useMyPickupRequests, useTodayChecklists } from "../../lib/queries";
import { useServerNow } from "../../lib/use-server-now";
import { PickupRequestDialog } from "../PickupRequestDialog";

const DUE_SOON_MS = 60 * 60_000;

type Tone = "idle" | "live" | "ok" | "warn" | "bad";

type Card = {
  tone: Tone;
  chip: string;
  line: ReactNode;
  progress?: number;
  action: ReactNode;
};

function Action({ href, label, icon, primary = false, disabled = false, onClick }: {
  href?: string;
  label: string;
  icon: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = `${primary ? "primary-button" : "ghost-button"} tb-action`;
  return href && !disabled ? (
    <Link className={className} href={href}>
      {icon} {label}
    </Link>
  ) : (
    <button className={className} disabled={disabled} type="button" onClick={onClick}>
      {icon} {label}
    </button>
  );
}

const viewHref = (view: PhaseView) => `/checklist/view/${view.phase.checklist?.id}`;
const submittedAt = (view: PhaseView) =>
  view.phase.checklist?.submitted_at
    ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" }).format(new Date(view.phase.checklist.submitted_at))
    : null;

function Board({ title, icon, window, card }: { title: string; icon: ReactNode; window: string; card: Card }) {
  return (
    <article className={`tb-card tone-${card.tone}`}>
      <header>
        <span className="tb-icon">{icon}</span>
        <div>
          <strong>{title}</strong>
          <small>{window}</small>
        </div>
        <span className={`jr-chip ${card.tone === "warn" ? "live" : card.tone}`}>{card.chip}</span>
      </header>
      <p className="tb-line">{card.line}</p>
      {card.progress !== undefined ? (
        <div className="tb-progress" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, card.progress * 100))}%` }} />
        </div>
      ) : null}
      {card.action}
    </article>
  );
}

/** Today at a glance: the pick-up, and the drop-off with its own deadline monitor. */
export function TodayBoard() {
  const today = useTodayChecklists();
  const requests = useMyPickupRequests();
  const [requesting, setRequesting] = useState(false);
  const data = today.data?.data ?? null;
  const now = useServerNow(today.data && data ? { serverTime: data.server_time, receivedAt: today.data.receivedAt } : null);
  const journey = useMemo(() => (data ? journeyOf(data, now) : null), [data, now]);

  if (today.isPending) return <div className="tb-skeleton" aria-busy="true" aria-label="Loading today" />;

  if (!data || !journey?.pick || !journey.drop) {
    return (
      <section className="panel">
        <p className="empty">
          <CircleAlert size={18} /> {data ? "No vehicle assigned yet. Your daily checklists will appear here once one is ready." : "We couldn't load today's checklists."}
        </p>
        {!data ? (
          <button className="ghost-button" type="button" onClick={() => void today.refetch()}>
            Try again
          </button>
        ) : null}
      </section>
    );
  }

  const { pick, drop } = journey;
  const request = requestForToday(requests.data, data.checklist_date);

  /* ---- Pick-up ---- */
  let pickCard: Card;
  if (pick.done) {
    pickCard = {
      tone: "ok",
      chip: "Done",
      line: <>Submitted{submittedAt(pick) ? ` at ${submittedAt(pick)}` : ""}. Your shift started.</>,
      action: <Action href={viewHref(pick)} icon={<Eye size={17} />} label="View result" />,
    };
  } else if (pick.inProgress) {
    pickCard = {
      tone: "live",
      chip: "In progress",
      line: "You've started but haven't submitted yet.",
      action: <Action primary href="/checklist/pick-up" icon={<Play size={17} fill="currentColor" />} label="Resume pick-up" />,
    };
  } else if (pick.state === "OPEN") {
    const left = pick.end - now;
    pickCard = {
      tone: left < 15 * 60_000 ? "warn" : "live",
      chip: "Open now",
      line: <>Window closes in <b>{spoken(left)}</b>.</>,
      progress: (now - pick.start) / (pick.end - pick.start),
      action: <Action primary href="/checklist/pick-up" icon={<Play size={17} fill="currentColor" />} label="Start pick-up" />,
    };
  } else if (pick.state === "UPCOMING") {
    pickCard = {
      tone: "idle",
      chip: "Upcoming",
      line: <>Opens in <b>{spoken(pick.start - now)}</b>.</>,
      action: <Action disabled icon={<Lock size={17} />} label={`Opens at ${clock(pick.phase.window.start_time)}`} />,
    };
  } else if (request?.status === "PENDING") {
    pickCard = {
      tone: "live",
      chip: "Request sent",
      line: <>Waiting for admin to approve {clock(request.requested_start_time)} – {clock(request.requested_end_time)}.</>,
      action: <Action disabled icon={<Hourglass size={17} />} label="Waiting for approval" />,
    };
  } else {
    pickCard = {
      tone: "bad",
      chip: "Missed",
      line:
        request?.status === "REJECTED"
          ? <>Your last request was declined{request.review_notes ? `: "${request.review_notes}"` : "."}</>
          : <>The window closed {spoken(now - pick.end)} ago. Request a new time to continue.</>,
      action: <Action primary icon={<CalendarClock size={17} />} label="Request new pick-up time" onClick={() => setRequesting(true)} />,
    };
  }

  /* ---- Drop-off (monitored) ---- */
  let dropCard: Card;
  const toDeadline = drop.end - now;
  if (drop.done) {
    dropCard = {
      tone: "ok",
      chip: "Done",
      line: <>Vehicle returned{submittedAt(drop) ? ` at ${submittedAt(drop)}` : ""}. Shift ended.</>,
      action: <Action href={viewHref(drop)} icon={<Eye size={17} />} label="View result" />,
    };
  } else if (!pick.done) {
    dropCard = {
      tone: "idle",
      chip: "Locked",
      line: "Unlocks once your pick-up checklist is done.",
      action: <Action disabled icon={<Lock size={17} />} label="Complete pick-up first" />,
    };
  } else {
    const overdue = toDeadline <= 0;
    const soon = !overdue && toDeadline <= DUE_SOON_MS;
    const cta =
      drop.canStart || drop.state === "CLOSED" ? (
        <Action
          primary
          href="/checklist/drop-off"
          icon={overdue ? <Siren size={17} /> : <Play size={17} fill="currentColor" />}
          label={drop.inProgress ? "Resume drop-off" : overdue ? "Complete drop-off now" : "Start drop-off"}
        />
      ) : (
        <Action disabled icon={<Lock size={17} />} label={`Opens at ${clock(drop.phase.window.start_time)}`} />
      );

    dropCard = {
      tone: overdue ? "bad" : soon ? "warn" : drop.state === "OPEN" ? "live" : "idle",
      chip: overdue ? "Overdue" : soon ? "Due soon" : drop.state === "OPEN" ? "Open now" : "On track",
      line: overdue ? (
        <>Deadline passed <b>{spoken(-toDeadline)}</b> ago. Bring the vehicle back now.</>
      ) : drop.state === "UPCOMING" ? (
        <>Opens in <b>{spoken(drop.start - now)}</b>. Deadline {clock(drop.phase.window.end_time)}.</>
      ) : (
        <>Deadline in <b>{spoken(toDeadline)}</b> ({clock(drop.phase.window.end_time)}).</>
      ),
      progress: drop.state === "OPEN" ? (now - drop.start) / (drop.end - drop.start) : undefined,
      action: cta,
    };
  }

  const dayText = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${data.checklist_date}T12:00:00+01:00`));

  return (
    <section className="tb" aria-label="Today's checklists">
      <header className="tb-head">
        <h2>
          <Timer size={16} /> Today
        </h2>
        <small>{dayText}</small>
      </header>
      <Board icon={<Play size={17} />} title="Pick-up" window={windowLabel(pick.phase.window)} card={pickCard} />
      <Board icon={<Flag size={17} />} title="Drop-off" window={windowLabel(drop.phase.window)} card={dropCard} />
      <p className="tb-foot">
        <Clock size={13} /> {drop.done ? "You're done for today." : "We alert you an hour before your drop-off deadline, and again if it passes."}
      </p>
      <PickupRequestDialog open={requesting} onClose={() => setRequesting(false)} now={now} onSent={() => void today.refetch()} />
    </section>
  );
}
