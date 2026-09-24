import type { ChecklistPhase, ChecklistWindow, PickupRequest, TodayChecklists } from "./types";

const DAY = 86_400_000;

/** Window times are wall-clock in Nigeria (UTC+1, no daylight saving). */
function instant(date: string, time: string) {
  return Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time.slice(0, 8)}+01:00`);
}

export function windowRange(date: string, window: ChecklistWindow) {
  const start = instant(date, window.start_time);
  let end = instant(date, window.end_time);
  if (end <= start) end += DAY; // a window that runs past midnight
  return { start, end };
}

/** "06:00:00" → "6:00 AM" */
export function clock(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const windowLabel = (w: ChecklistWindow) => `${clock(w.start_time)} – ${clock(w.end_time)}`;

export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/** "2h 14m" / "14m 09s" / "42s", for sentences rather than the big clock. */
export function spoken(ms: number) {
  const { hours, minutes, seconds } = splitDuration(ms);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export type PhaseView = {
  phase: ChecklistPhase;
  start: number;
  end: number;
  /** Local read of the window against the server-synced clock, so the UI flips without waiting on a refetch. */
  state: "UPCOMING" | "OPEN" | "CLOSED";
  done: boolean;
  inProgress: boolean;
  canStart: boolean;
};

export function viewPhase(phase: ChecklistPhase, date: string, now: number, hasVehicle: boolean): PhaseView {
  const { start, end } = windowRange(date, phase.window);
  const state = now < start ? "UPCOMING" : now < end ? "OPEN" : "CLOSED";
  const done = phase.checklist?.status === "SUBMITTED";
  const inProgress = phase.checklist?.status === "IN_PROGRESS";
  return { phase, start, end, state, done, inProgress, canStart: hasVehicle && !done && (state === "OPEN" || inProgress) };
}

export type Stage =
  | "no-vehicle"
  | "pickup-upcoming"
  | "pickup-open"
  | "pickup-missed"
  | "shift"
  | "dropoff-open"
  | "dropoff-overdue"
  | "complete";

export function journeyOf(today: TodayChecklists, now: number) {
  const hasVehicle = Boolean(today.vehicle);
  const find = (name: "PICK_UP" | "DROP_OFF") => today.phases.find((p) => p.phase === name);
  const pickPhase = find("PICK_UP");
  const dropPhase = find("DROP_OFF");
  const pick = pickPhase && viewPhase(pickPhase, today.checklist_date, now, hasVehicle);
  const drop = dropPhase && viewPhase(dropPhase, today.checklist_date, now, hasVehicle);

  let stage: Stage;
  if (!hasVehicle || !pick || !drop) stage = "no-vehicle";
  else if (drop.done) stage = "complete";
  else if (pick.done) stage = drop.state === "UPCOMING" ? "shift" : drop.state === "OPEN" ? "dropoff-open" : "dropoff-overdue";
  else if (pick.state === "UPCOMING") stage = "pickup-upcoming";
  else if (pick.state === "OPEN" || pick.inProgress) stage = "pickup-open";
  else stage = "pickup-missed";

  return { stage, pick, drop };
}

/** The request the driver made for today's date, if any: pending first, then the newest decision. */
export function requestForToday(requests: PickupRequest[] | undefined, date: string) {
  const mine = (requests ?? []).filter((r) => r.requested_date === date);
  return mine.find((r) => r.status === "PENDING") ?? mine[0] ?? null;
}
