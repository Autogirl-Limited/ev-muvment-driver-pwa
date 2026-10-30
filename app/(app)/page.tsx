"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { DailyJourney } from "../components/DailyJourney";
import { KycBanner, KycPrompt } from "../components/KycPrompt";
import { PasskeyPrompt } from "../components/PasskeyPrompt";
import { LeaderboardTeaser } from "../components/leaderboard/LeaderboardTeaser";
import { StatsCarousel } from "../components/StatsCarousel";

export default function HomePage() {
  const { data: session } = useSession();
  // One prompt at a time: the BVN/NIN ask comes before the fingerprint suggestion.
  const [kycDue, setKycDue] = useState<boolean>();
  if (!session?.profile) return null;

  return (
    <div className="screen-enter">
      <section className="home">
        <KycBanner />
        <StatsCarousel />
        <LeaderboardTeaser />
        <DailyJourney />
      </section>
      <KycPrompt onDueChange={setKycDue} />
      {kycDue === false ? <PasskeyPrompt /> : null}
    </div>
  );
}
