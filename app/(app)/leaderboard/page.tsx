"use client";

import { useSession } from "next-auth/react";
import { Leaderboard } from "../../components/leaderboard/Leaderboard";

export default function LeaderboardPage() {
  const { data: session } = useSession();
  if (!session?.profile) return null;

  return (
    <div className="screen-enter">
      <section className="home">
        <Leaderboard />
      </section>
    </div>
  );
}
