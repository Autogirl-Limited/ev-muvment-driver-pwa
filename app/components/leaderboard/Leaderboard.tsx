"use client";

import { useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, CircleAlert, Crown, Flame, Trophy, Users } from "lucide-react";
import { lagosDate } from "../../lib/format";
import { useLeaderboard } from "../../lib/queries";
import { timeAgo } from "../../lib/time";
import type { Leaderboard as Board, LeaderboardEntry } from "../../lib/types";
import { useRealtimeStatus } from "../RealtimeProvider";
import { EmptyState } from "../Ui";
import { hueOf, initials, plural, useCountUp, useFlip, useNow, useRankImproved, useRankMoves, type RankMove } from "./motion";

type Day = "today" | "yesterday";
const DAYS: { key: Day; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
];

const avatarStyle = (id: string) => ({ "--hue": hueOf(id) }) as CSSProperties;

function Count({ value }: { value: number }) {
  const shown = useCountUp(value);
  return <>{shown.toLocaleString()}</>;
}

function Move({ move }: { move: RankMove | undefined }) {
  if (!move) return null;
  return (
    <span className={`lb-move ${move}`} aria-label={move === "up" ? "Moved up" : "Moved down"}>
      {move === "up" ? <ChevronUp size={13} strokeWidth={3} /> : <ChevronDown size={13} strokeWidth={3} />}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Podium                                                              */
/* ------------------------------------------------------------------ */
function Step({ entry, place, move }: { entry: LeaderboardEntry; place: 1 | 2 | 3; move: RankMove | undefined }) {
  return (
    <div className={`lb-step place-${place} ${entry.is_me ? "me" : ""}`} data-flip={entry.user_id} role="listitem">
      <div className="lb-step-driver">
        {place === 1 ? (
          <span className="lb-crown" aria-hidden="true">
            <Crown size={22} fill="currentColor" />
          </span>
        ) : null}
        <span className="lb-avatar" style={avatarStyle(entry.user_id)}>
          {initials(entry.display_name)}
          <Move move={move} />
        </span>
        <strong>
          {entry.display_name}
          {entry.is_me ? <i className="lb-you">You</i> : null}
        </strong>
      </div>
      <div className="lb-block">
        <b>
          <Count value={entry.transaction_count} />
        </b>
        <small>{entry.transaction_count === 1 ? "txn" : "txns"}</small>
        <span className="lb-place">{entry.rank}</span>
      </div>
    </div>
  );
}

function Podium({ entries, moves }: { entries: LeaderboardEntry[]; moves: Map<string, RankMove> }) {
  const [first, second, third] = entries;
  // Silver on the left, gold in the middle, bronze on the right - the classic shape.
  const steps: [LeaderboardEntry | undefined, 1 | 2 | 3][] = [
    [second, 2],
    [first, 1],
    [third, 3],
  ];
  return (
    <div className="lb-podium" role="list" aria-label="Top three drivers">
      {steps.map(([entry, place]) =>
        entry ? <Step entry={entry} key={entry.user_id} move={moves.get(entry.user_id)} place={place} /> : <div className={`lb-step place-${place} empty`} key={`empty-${place}`} aria-hidden="true" />,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Your standing                                                       */
/* ------------------------------------------------------------------ */
function standingMessage(board: Board) {
  const { me, is_today: today, ranked_drivers: ranked, entries } = board;
  const n = (count: number) => plural(count, "transaction");

  if (!today) {
    if (me.rank === 1) return "You led the fleet this day. Do it again today!";
    if (me.rank) return `${n(me.behind_leader)} behind the day’s leader.`;
    return "You weren’t on the board this day.";
  }
  if (me.rank === null) {
    return ranked ? "Your first transaction today puts you on the board." : "Nobody is on the board yet. Your first transaction today takes #1.";
  }
  if (me.rank === 1) {
    const tied = entries.filter((entry) => entry.rank === 1).length > 1;
    if (tied) return "You’re tied for the lead. One more transaction takes it outright.";
    return ranked > 1 ? "You’re leading the fleet today. Stay ahead!" : "You’re leading today. Keep the transactions coming.";
  }
  if (me.behind_next === 1) return "1 more transaction to pass the driver above you.";
  if (me.behind_next) return `${me.behind_next} more transactions to pass the driver above you.`;
  return `${n(me.behind_leader)} behind the leader.`;
}

function Standing({ board, date, settled }: { board: Board; date: string; settled: boolean }) {
  const { me } = board;
  const leaderCount = board.entries[0]?.transaction_count ?? me.transaction_count + me.behind_leader;
  const progress = leaderCount ? Math.min(1, me.transaction_count / leaderCount) : 0;
  const celebrating = useRankImproved(settled ? me.rank : undefined, date);
  const shownCount = useCountUp(me.transaction_count);
  const tone = me.rank === 1 ? "gold" : me.rank === null ? "idle" : "blue";

  return (
    <section className={`lb-me ${tone} ${celebrating ? "celebrate" : ""}`} aria-label="Your standing">
      {celebrating ? (
        <span className="lb-confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ "--n": i } as CSSProperties} />
          ))}
        </span>
      ) : null}
      <div className="lb-me-rank" key={me.rank ?? "none"}>
        <small>{board.is_today ? "Your rank" : "You finished"}</small>
        <strong>{me.rank ? `#${me.rank}` : "—"}</strong>
      </div>
      <div className="lb-me-body">
        <p className="lb-me-count">
          <b>{shownCount.toLocaleString()}</b> {me.transaction_count === 1 ? "transaction" : "transactions"}
          {board.is_today ? " today" : ""}
        </p>
        <div className="lb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={leaderCount} aria-valuenow={me.transaction_count} aria-label="Progress towards the leader">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p className="lb-me-note" aria-live="polite">
          {me.rank === 1 ? <Flame size={14} /> : null}
          {standingMessage(board)}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */
function Row({ entry, index, move, now }: { entry: LeaderboardEntry; index: number; move: RankMove | undefined; now: number }) {
  return (
    <li className={`lb-row ${entry.is_me ? "me" : ""}`} data-flip={entry.user_id} style={{ "--i": index } as CSSProperties}>
      <span className="lb-rank">
        {entry.rank}
        <Move move={move} />
      </span>
      <span className="lb-avatar" style={avatarStyle(entry.user_id)}>
        {initials(entry.display_name)}
      </span>
      <span className="lb-main">
        <strong>
          {entry.display_name}
          {entry.is_me ? <i className="lb-you">You</i> : null}
        </strong>
        <small>Last paid {timeAgo(entry.last_transaction_at, now).replace(/^Just now$/, "just now")}</small>
      </span>
      <span className="lb-count">
        <b>
          <Count value={entry.transaction_count} />
        </b>
        <small>{entry.transaction_count === 1 ? "txn" : "txns"}</small>
      </span>
    </li>
  );
}

function Skeleton() {
  return (
    <div className="lb-skeleton" aria-busy="true" aria-label="Loading leaderboard">
      <div className="lb-podium">
        {[2, 1, 3].map((place) => (
          <div className={`lb-step place-${place} ghost`} key={place}>
            <div className="lb-step-driver">
              <span className="lb-avatar" />
              <strong />
            </div>
            <div className="lb-block" />
          </div>
        ))}
      </div>
      <span className="skeleton" style={{ height: "6.5rem" }} />
      <span className="skeleton" style={{ height: "4rem" }} />
      <span className="skeleton" style={{ height: "4rem" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export function Leaderboard() {
  const [day, setDay] = useState<Day>("today");
  const today = lagosDate();
  const date = day === "today" ? today : lagosDate(-1);
  const query = useLeaderboard(date, today);
  const live = useRealtimeStatus() === "live";
  const board = query.data;
  // While switching day the other day's board is still on screen as a placeholder: never compare ranks against it.
  const settled = query.isPlaceholderData ? undefined : board;
  const moves = useRankMoves(settled?.entries, date);
  const listRef = useRef<HTMLDivElement>(null);
  useFlip(listRef, `${date}:${board?.entries.map((entry) => entry.user_id).join(",") ?? ""}`);
  const now = useNow();
  const dayIndex = DAYS.findIndex((item) => item.key === day);
  const rest = board?.entries.slice(3) ?? [];

  return (
    <section className="lb" aria-label="Leaderboard">
      <header className="lb-head">
        <div>
          <h2>
            <Trophy size={17} /> Who’s leading
          </h2>
          <small>
            Ranked by number of transactions received{board?.is_today === false ? " that day" : " today"}.
          </small>
        </div>
        {day === "today" ? (
          <span className={`pill ${live ? "pill-live" : ""}`}>
            <i /> {live ? "Live" : "Updating"}
          </span>
        ) : null}
      </header>

      <div className="segmented-group lb-days" role="radiogroup" aria-label="Day" style={{ "--count": DAYS.length, "--index": dayIndex } as CSSProperties}>
        <span className="segmented-thumb" aria-hidden="true" />
        {DAYS.map((item) => (
          <button aria-checked={day === item.key} className={day === item.key ? "selected" : ""} key={item.key} role="radio" type="button" onClick={() => setDay(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <Skeleton />
      ) : query.isError && !board ? (
        <EmptyState icon={<CircleAlert size={30} />} title="Couldn’t load the leaderboard">
          <button className="ghost-button" type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : board && board.entries.length === 0 ? (
        <>
          <EmptyState icon={<Trophy size={30} />} title={board.is_today ? "The board is empty" : "Nothing was recorded"}>
            {board.is_today ? "No driver has received a transaction yet today. Your first one takes #1." : "No transactions were received by any driver on this day."}
          </EmptyState>
          <Standing board={board} date={date} settled={!query.isPlaceholderData} />
        </>
      ) : board ? (
        <div className={`lb-body ${query.isPlaceholderData ? "loading" : ""}`} ref={listRef}>
          <Podium entries={board.entries} moves={moves} />
          <Standing board={board} date={date} settled={!query.isPlaceholderData} />

          {rest.length ? (
            <ol className="lb-list" aria-label="Other drivers" start={4}>
              {rest.map((entry, index) => (
                <Row entry={entry} index={index} key={entry.user_id} move={moves.get(entry.user_id)} now={now} />
              ))}
            </ol>
          ) : null}

          <footer className="lb-foot">
            <span>
              <Users size={14} /> {plural(board.ranked_drivers, "driver")} on the board · {plural(board.total_transactions, "transaction")}
            </span>
            <span>Updated {timeAgo(board.generated_at, now).toLowerCase()}</span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
