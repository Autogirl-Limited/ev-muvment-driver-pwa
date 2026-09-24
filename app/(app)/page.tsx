"use client";

import { useSession } from "next-auth/react";
import { DailyJourney } from "../components/DailyJourney";
import { StatsCarousel } from "../components/StatsCarousel";

export default function HomePage() {
  const { data: session } = useSession();
  if (!session?.profile) return null;

  return (
    <div className="screen-enter">
      <section className="home">
        <StatsCarousel />
        <DailyJourney />
      </section>
    </div>
  );
}
