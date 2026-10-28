"use client";

import { useSession } from "next-auth/react";
import { DailyJourney } from "../components/DailyJourney";
import { PasskeyPrompt } from "../components/PasskeyPrompt";
import { LeaderboardTeaser } from "../components/leaderboard/LeaderboardTeaser";
import { StatsCarousel } from "../components/StatsCarousel";

export default function HomePage() {
  const { data: session } = useSession();
  if (!session?.profile) return null;

  return (
    <div className="screen-enter">
      <section className="home">
        <StatsCarousel />
        <LeaderboardTeaser />
        <DailyJourney />
      </section>
      <PasskeyPrompt />
    </div>
  );
}
