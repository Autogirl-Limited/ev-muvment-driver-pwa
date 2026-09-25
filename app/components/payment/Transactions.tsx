"use client";

import { useRef, useState } from "react";
import { ArrowDownLeft, ChevronRight, CircleAlert, Copy, Landmark, ReceiptText, X } from "lucide-react";
import { toast } from "sonner";
import { lagosDate, naira } from "../../lib/format";
import { resolveDateFilter, type DateFilter } from "../../lib/date-range";
import { TRANSACTIONS_PAGE_SIZE, useDvaStats, useDvaTransactions } from "../../lib/queries";
import { dayLabel } from "../../lib/time";
import type { DvaTransaction } from "../../lib/types";
import { DateRangeFilter } from "../DateRangeFilter";
import { Modal } from "../Modal";
import { Pagination } from "../Pagination";
import { EmptyState } from "../Ui";

const clockTime = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const fullDate = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const masked = (number: string | null) => (number ? `••••${number.slice(-4)}` : null);

const initials = (name: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function Row({ tx, onOpen }: { tx: DvaTransaction; onOpen: () => void }) {
  const sender = tx.payer_name?.trim() || "Unknown sender";
  const detail = [tx.payer_bank_name, masked(tx.payer_account_number)].filter(Boolean).join(" · ");
  return (
    <li>
      <button className="tx-row" type="button" onClick={onOpen}>
        <span className="tx-avatar">{initials(tx.payer_name) || <Landmark size={17} />}</span>
        <span className="tx-main">
          <strong>{sender}</strong>
          <small>{tx.narration?.trim() || detail || "Bank transfer"}</small>
        </span>
        <span className="tx-side">
          <b>+{naira(tx.amount)}</b>
          <small>{clockTime(tx.paid_at)}</small>
        </span>
        <ChevronRight size={16} className="tx-chevron" />
      </button>
    </li>
  );
}

function Receipt({ tx, onClose }: { tx: DvaTransaction; onClose: () => void }) {
  const rows: [string, string | null][] = [
    ["From", tx.payer_name?.trim() || "Unknown sender"],
    ["Bank", tx.payer_bank_name],
    ["Account", masked(tx.payer_account_number)],
    ["Note", tx.narration?.trim() || null],
    ["Received", fullDate(tx.paid_at)],
  ];
  const reference = tx.transaction_reference;

  return (
    <div className="rc">
      <button className="icon-button plain rc-close" type="button" aria-label="Close" onClick={onClose}>
        <X size={18} />
      </button>
      <span className="rc-icon">
        <ArrowDownLeft size={26} />
      </span>
      <small>Money received</small>
      <strong className="rc-amount">+{naira(tx.amount)}</strong>

      <dl>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        <div>
          <dt>Reference</dt>
          <dd className="rc-ref">
            <span>{reference}</span>
            <button
              aria-label="Copy reference"
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(reference).then(
                  () => toast.success("Reference copied."),
                  () => toast.error("Couldn't copy the reference."),
                )
              }
            >
              <Copy size={14} />
            </button>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Money received, page by page, with the total for whatever period is selected. */
export function Transactions() {
  const [filter, setFilter] = useState<DateFilter>({ preset: "all" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<DvaTransaction | null>(null);
  const top = useRef<HTMLElement>(null);
  const range = resolveDateFilter(filter, lagosDate());
  const list = useDvaTransactions(page, range);
  const stats = useDvaStats(range);

  const data = list.data;
  const items = data?.items ?? [];
  const totalPages = data?.pagination.total_pages ?? 1;

  // Filtering (or a refresh) can leave the current page past the end: step back in.
  if (data && page > Math.max(1, totalPages)) setPage(Math.max(1, totalPages));


  const changePage = (next: number) => {
    setPage(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Group the visible page by day, in order.
  const groups: [string, DvaTransaction[]][] = [];
  for (const tx of items) {
    const label = dayLabel(tx.paid_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(tx);
    else groups.push([label, [tx]]);
  }

  return (
    <section className="tx" ref={top} aria-label="Money received" style={{ scrollMarginTop: "4.5rem" }}>
      <header className="tx-head">
        <div>
          <h2>
            <ReceiptText size={16} /> Money received
          </h2>
          {stats.data ? (
            <small>
              <b>{naira(stats.data.total_amount_received)}</b> · {stats.data.transaction_count} {stats.data.transaction_count === 1 ? "transfer" : "transfers"}
            </small>
          ) : null}
        </div>
        <DateRangeFilter
          className="tx-filter"
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
        />
      </header>

      {list.isPending ? (
        <ul className="tx-list" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li className="tx-skeleton" key={i} />
          ))}
        </ul>
      ) : list.isError ? (
        <EmptyState icon={<CircleAlert size={30} />} title="Couldn't load your transactions">
          <button className="ghost-button" type="button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={<ReceiptText size={30} />} title={filter.preset === "all" ? "No transfers yet" : "Nothing in this period"}>
          {filter.preset === "all"
            ? "When someone sends money to your account, it will appear here right away."
            : "Try a wider date range to see more."}
        </EmptyState>
      ) : (
        <div className={`tx-body ${list.isPlaceholderData ? "loading" : ""}`}>
          {groups.map(([label, group]) => (
            <div key={label}>
              <h3 className="nt-day">{label}</h3>
              <ul className="tx-list">
                {group.map((tx) => (
                  <Row key={tx.id} tx={tx} onOpen={() => setOpen(tx)} />
                ))}
              </ul>
            </div>
          ))}

          {data ? (
            <Pagination
              busy={list.isFetching}
              page={data.pagination.page}
              pageSize={TRANSACTIONS_PAGE_SIZE}
              totalItems={data.pagination.total_items}
              totalPages={totalPages}
              onPage={changePage}
            />
          ) : null}
        </div>
      )}

      <Modal label="Transaction receipt" open={open !== null} onClose={() => setOpen(null)} panelClassName="rc-panel">
        {open ? <Receipt tx={open} onClose={() => setOpen(null)} /> : null}
      </Modal>
    </section>
  );
}
