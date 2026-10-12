"use client";

import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { lagosDate } from "../../lib/format";
import { useLeaderboard } from "../../lib/queries";
import { plural } from "./motion";

/** Home-screen card: your place on today's board at a glance, tapping through to the full leaderboard. */
export function LeaderboardTeaser() {
  const today = lagosDate();
  const { data: board } = useLeaderboard(today, today);

  let headline = "See who’s leading today";
  let detail = "Ranked by transactions received.";
  if (board) {
    const { me, entries, ranked_drivers: ranked } = board;
    const leader = entries[0];
    if (me.rank === 1) {
      headline = entries.filter((entry) => entry.rank === 1).length > 1 ? "You’re tied for #1" : "You’re leading today";
      detail = `${plural(me.transaction_count, "transaction")} · ${plural(ranked, "driver")} on the board`;
    } else if (me.rank) {
      headline = `You’re #${me.rank} today`;
      detail = me.behind_next === 1 ? "1 more transaction to move up." : me.behind_next ? `${me.behind_next} more transactions to move up.` : `${plural(me.behind_leader, "transaction")} behind the leader.`;
    } else if (leader) {
      headline = `${leader.display_name} is leading`;
      detail = `${plural(leader.transaction_count, "transaction")} so far. Your first one puts you on the board.`;
    } else {
      headline = "The board is wide open";
      detail = "No transactions yet today. Your first one takes #1.";
    }
  }

  return (
    <Link className={`lb-teaser ${board?.me.rank === 1 ? "gold" : ""}`} href="/leaderboard">
      <span className="lb-teaser-icon">
        <Trophy size={20} />
      </span>
      <span className="lb-teaser-text">
        <strong>{headline}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={18} className="lb-teaser-chevron" />
    </Link>
  );
}
