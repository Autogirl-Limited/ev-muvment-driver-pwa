"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, ClipboardList, Flag, Play } from "lucide-react";
import { lagosDate } from "../../lib/format";
import { useChecklistHistory } from "../../lib/queries";
import { dayLabel } from "../../lib/time";
import type { ChecklistPhaseName, DailyChecklist } from "../../lib/types";
import { EmptyState, Spinner } from "../Ui";

const FILTERS: { label: string; value: ChecklistPhaseName | null }[] = [
  { label: "All", value: null },
  { label: "Pick-up", value: "PICK_UP" },
  { label: "Drop-off", value: "DROP_OFF" },
];

const time = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : null;

function outcome(c: DailyChecklist): { label: string; tone: string } {
  if (c.status !== "SUBMITTED") return { label: "Not submitted", tone: "idle" };
  if (c.comparison?.verdict === "NEW_DAMAGE") return { label: "New damage", tone: "bad" };
  if (c.flags.some((f) => f.severity === "CRITICAL")) return { label: "Flagged", tone: "bad" };
  if (c.condition?.status === "NOT_GOOD" || c.flags.some((f) => f.severity === "WARNING")) return { label: "Needs attention", tone: "warn" };
  if (c.analysis.status === "PENDING" || c.analysis.status === "PROCESSING") return { label: "Reading…", tone: "idle" };
  return { label: "All good", tone: "ok" };
}

function Row({ c }: { c: DailyChecklist }) {
  const drop = c.phase === "DROP_OFF";
  const result = outcome(c);
  const at = time(c.submitted_at ?? c.started_at);
  return (
    <li>
      <Link className="ch-row" href={`/checklist/view/${c.id}`}>
        <span className="jr-row-icon">{drop ? <Flag size={16} /> : <Play size={16} />}</span>
        <div>
          <strong>{drop ? "Drop-off" : "Pick-up"}</strong>
          <small>{at ? (c.status === "SUBMITTED" ? `Submitted ${at}` : `Started ${at}`) : "—"}</small>
        </div>
        <span className={`cl-tag ${result.tone}`}>{result.label}</span>
        <ChevronRight size={18} />
      </Link>
    </li>
  );
}

/** Past checklists, newest first, grouped by day. Today's live on the board above. */
export function ChecklistHistory() {
  const [phase, setPhase] = useState<ChecklistPhaseName | null>(null);
  const query = useChecklistHistory(phase);
  const today = lagosDate();

  const groups = useMemo(() => {
    const map = new Map<string, DailyChecklist[]>();
    for (const c of query.data?.pages.flatMap((page) => page.items) ?? []) {
      if (c.checklist_date === today) continue;
      map.set(c.checklist_date, [...(map.get(c.checklist_date) ?? []), c]);
    }
    return [...map.entries()];
  }, [query.data, today]);

  return (
    <section className="ch" aria-label="Checklist history">
      <header className="tb-head">
        <h2>
          <ClipboardList size={16} /> History
        </h2>
      </header>

      <div className="nt-tabs" role="tablist">
        {FILTERS.map((filter) => (
          <button aria-selected={phase === filter.value} key={filter.label} role="tab" type="button" onClick={() => setPhase(filter.value)}>
            {filter.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <ul className="nt-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li className="nt-skeleton" key={i} />
          ))}
        </ul>
      ) : query.isError ? (
        <EmptyState icon={<CircleAlert size={30} />} title="Couldn't load your history">
          <button className="ghost-button" type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState icon={<ClipboardList size={30} />} title="No past checklists yet">
          Once you&apos;ve completed a day, it will show up here so you can look back at it.
        </EmptyState>
      ) : (
        <>
          {groups.map(([date, items]) => (
            <div key={date}>
              <h3 className="nt-day">{dayLabel(`${date}T12:00:00+01:00`)}</h3>
              <ul className="ch-list">
                {items.map((c) => (
                  <Row c={c} key={c.id} />
                ))}
              </ul>
            </div>
          ))}
          {query.hasNextPage ? (
            <button className="ghost-button" disabled={query.isFetchingNextPage} type="button" onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? <Spinner /> : null} Load older
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
