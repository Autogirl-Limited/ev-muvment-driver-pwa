"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, ClipboardList, Flag, Play } from "lucide-react";
import { resolveDateFilter, type DateFilter } from "../../lib/date-range";
import { lagosDate } from "../../lib/format";
import { DateRangeFilter } from "../DateRangeFilter";
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

/** Checklists in the chosen period (last 7 days by default), newest first, grouped by day. */
export function ChecklistHistory() {
  const [phase, setPhase] = useState<ChecklistPhaseName | null>(null);
  const [filter, setFilter] = useState<DateFilter>({ preset: "week" });
  const range = resolveDateFilter(filter, lagosDate());
  const query = useChecklistHistory(phase, range);

  const groups = useMemo(() => {
    const map = new Map<string, DailyChecklist[]>();
    for (const c of query.data?.pages.flatMap((page) => page.items) ?? []) {
      if ((range.from && c.checklist_date < range.from) || (range.to && c.checklist_date > range.to)) continue;
      map.set(c.checklist_date, [...(map.get(c.checklist_date) ?? []), c]);
    }
    return [...map.entries()];
  }, [query.data, range.from, range.to]);

  return (
    <section className="ch" aria-label="Checklist history">
      <header className="tb-head">
        <h2>
          <ClipboardList size={16} /> History
        </h2>
        <DateRangeFilter value={filter} onChange={setFilter} />
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
        <EmptyState icon={<ClipboardList size={30} />} title="No checklists in this period">
          Try a wider date range to look further back.
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
