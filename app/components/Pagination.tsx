"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/** 1 … 4 [5] 6 … 12: always the ends plus the neighbours of the current page. */
function pageWindow(page: number, total: number): (number | "gap-left" | "gap-right")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap-left" | "gap-right")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(i === 1 ? "gap-left" : "gap-right");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  busy = false,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  busy?: boolean;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <nav className="pg" aria-label="Pagination" aria-busy={busy}>
      <p className="pg-summary" aria-live="polite">
        Showing <b>{from}–{to}</b> of <b>{totalItems.toLocaleString()}</b>
      </p>

      <div className="pg-bar">
        <button className="pg-step" disabled={page <= 1} type="button" onClick={() => onPage(page - 1)}>
          <ChevronLeft size={20} />
          <span>Prev</span>
        </button>

        <ol className="pg-pages">
          {pageWindow(page, totalPages).map((item) =>
            typeof item === "number" ? (
              <li key={item}>
                <button
                  aria-current={item === page ? "page" : undefined}
                  aria-label={`Page ${item}`}
                  className={item === page ? "on" : ""}
                  type="button"
                  onClick={() => item !== page && onPage(item)}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li aria-hidden="true" className="pg-gap" key={item}>
                …
              </li>
            ),
          )}
        </ol>

        <button className="pg-step" disabled={page >= totalPages} type="button" onClick={() => onPage(page + 1)}>
          <span>Next</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </nav>
  );
}
