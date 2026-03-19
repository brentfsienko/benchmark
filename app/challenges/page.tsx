"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { env } from "@/src/lib/env";
import { getParkLeaderboard, joinChallenge, listChallenges, recordChallengeProgress } from "@/src/lib/api";
import type { Challenge, LeaderboardEntry } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { trackEvent } from "@/src/lib/analytics";

function ChallengesContent() {
  const searchParams = useSearchParams();
  const parkID = searchParams.get("park") ?? "volunteer-park";
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listChallenges(parkID), getParkLeaderboard(parkID)])
      .then(([challengeRows, leaderboardRows]) => {
        setChallenges(challengeRows);
        setLeaderboard(leaderboardRows);
      })
      .catch((err: Error) => setStatus(err.message));
  }, [parkID]);

  return (
    <section className="screen">
      <SectionHeader title="summer play" subtitle="public challenges and leaderboard" />
      <div style={{ display: "grid", gap: 12 }}>
        {challenges.map((challenge) => (
          <article key={challenge.id} className="surface-card" style={{ padding: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{challenge.title}</p>
            <p className="muted" style={{ margin: "6px 0 0 0" }}>
              {challenge.description}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="button-primary"
                onClick={() =>
                  joinChallenge(challenge.id, env.currentUserID)
                    .then(() => {
                      setStatus("joined challenge");
                      trackEvent({ name: "challenge_joined", userId: env.currentUserID, metadata: { challengeId: challenge.id } });
                    })
                    .catch((err: Error) => setStatus(err.message))
                }
              >
                join
              </button>
              <button
                className="button-secondary"
                onClick={() =>
                  recordChallengeProgress(challenge.id, env.currentUserID, 1)
                    .then(() => getParkLeaderboard(parkID))
                    .then((rows) => {
                      setLeaderboard(rows);
                      setStatus("progress added");
                    })
                    .catch((err: Error) => setStatus(err.message))
                }
              >
                +1 benchmark
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className="surface-card" style={{ padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>leaderboard</h2>
        {leaderboard.length === 0 ? <p className="muted">no entries yet</p> : null}
        <div style={{ display: "grid", gap: 6 }}>
          {leaderboard.map((entry) => (
            <div key={`${entry.userId}-${entry.rank}`} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                #{entry.rank} {entry.userId}
              </span>
              <span>
                {entry.points} pts ({entry.progress})
              </span>
            </div>
          ))}
        </div>
      </section>
      {status ? <p style={{ color: "var(--accent)" }}>{status}</p> : null}
    </section>
  );
}

export default function ChallengesPage() {
  return (
    <Suspense fallback={<section className="screen"><p className="muted">loading…</p></section>}>
      <ChallengesContent />
    </Suspense>
  );
}
