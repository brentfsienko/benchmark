"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/src/contexts/auth-context";
import { getParkLeaderboard, joinChallenge, listChallenges, listNearbyBenches, recordChallengeProgress } from "@/src/lib/api";
import type { Challenge, LeaderboardEntry } from "@/src/lib/types";
import { trackEvent } from "@/src/lib/analytics";
import { FollowButton } from "@/src/components/follow-button";

const PARKS = [
  { id: "green-lake", name: "Green Lake", description: "2.8 mile loop • 8 benches" },
  { id: "volunteer-park", name: "Volunteer Park", description: "Capitol Hill • 5 benches" }
];

const GREEN_LAKE_CENTER = { lat: 47.6798, lng: -122.3288 };

function ChallengesContent() {
  const searchParams = useSearchParams();
  const { profileId } = useAuth();
  const parkID = searchParams.get("park") ?? "green-lake";
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [benches, setBenches] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listChallenges(parkID),
      getParkLeaderboard(parkID),
      parkID === "green-lake"
        ? listNearbyBenches({ lat: GREEN_LAKE_CENTER.lat, lng: GREEN_LAKE_CENTER.lng, radiusMeters: 1500 })
        : Promise.resolve([])
    ])
      .then(([challengeRows, leaderboardRows, benchRows]) => {
        setChallenges(challengeRows);
        setLeaderboard(leaderboardRows);
        setBenches((benchRows ?? []).map((b) => ({ id: b.id, name: b.name })));
      })
      .catch((err: Error) => setStatus(err.message))
      .finally(() => setLoading(false));
  }, [parkID]);

  const glChallenge = challenges.find((c) => c.id === "challenge-gl-summer-2025" || c.parkId === "green-lake");

  return (
    <section className="screen">
      <h1 style={{ marginTop: 0, fontSize: 24, fontWeight: 700, textTransform: "lowercase" }}>play</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        summer challenges • climb leaderboards • explore your parks
      </p>

      {/* Park selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {PARKS.map((park) => (
          <Link
            key={park.id}
            href={`/challenges?park=${park.id}`}
            className={parkID === park.id ? "button-primary" : "button-secondary"}
            style={{ fontSize: 13 }}
          >
            {park.name}
          </Link>
        ))}
      </div>

      {loading ? (
        <p className="muted">loading…</p>
      ) : (
        <>
          {/* Green Lake Summer Challenge - hero card */}
          {parkID === "green-lake" && glChallenge && (
            <article
              className="surface-card"
              style={{
                padding: 20,
                marginBottom: 16,
                borderLeft: "4px solid var(--accent)",
                background: "linear-gradient(135deg, var(--surface) 0%, var(--elevated) 100%)"
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--accent)"
                }}
              >
                summer 2025
              </span>
              <h2 style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 700 }}>
                Green Lake Summer Bench Tour
              </h2>
              <p className="muted" style={{ margin: "8px 0 16px", lineHeight: 1.5 }}>
                Visit and submit benchmarks at all 8 benches around Green Lake. Complete the 2.8 mile loop and climb the leaderboard. 15 pts per bench.
              </p>
              {benches.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>benches to visit</p>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-secondary)" }}>
                    {benches.slice(0, 8).map((b) => (
                      <li key={b.id}>
                        <Link href={`/bench/${b.id}`} style={{ color: "inherit" }}>{b.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {profileId ? (
                  <>
                    <button
                      className="button-primary"
                      onClick={() =>
                        joinChallenge(glChallenge.id, profileId)
                          .then(() => {
                            setStatus("joined!");
                            trackEvent({ name: "challenge_joined", userId: profileId, metadata: { challengeId: glChallenge.id } });
                          })
                          .catch((err: Error) => setStatus(err.message))
                      }
                    >
                      join challenge
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() =>
                        recordChallengeProgress(glChallenge.id, profileId, 1)
                          .then(() => getParkLeaderboard(parkID))
                          .then(setLeaderboard)
                          .then(() => setStatus("+1 benchmark recorded! visit a bench to add more."))
                          .catch((err: Error) => setStatus(err.message))
                      }
                    >
                      +1 benchmark
                    </button>
                  </>
                ) : (
                  <Link href="/auth/login" className="button-primary">
                    sign in to join
                  </Link>
                )}
                <Link href="/explore" className="button-secondary">
                  find on map
                </Link>
              </div>
            </article>
          )}

          {/* Other challenges */}
          {challenges.filter((c) => c.id !== glChallenge?.id).map((challenge) => (
            <article key={challenge.id} className="surface-card" style={{ padding: 14, marginBottom: 12 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{challenge.title}</p>
              <p className="muted" style={{ margin: "6px 0 0 0" }}>{challenge.description}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {profileId && (
                  <>
                    <button
                      className="button-primary"
                      onClick={() =>
                        joinChallenge(challenge.id, profileId)
                          .then(() => setStatus("joined"))
                          .catch((err: Error) => setStatus(err.message))
                      }
                    >
                      join
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() =>
                        recordChallengeProgress(challenge.id, profileId, 1)
                          .then(() => getParkLeaderboard(parkID))
                          .then(setLeaderboard)
                          .catch((err: Error) => setStatus(err.message))
                      }
                    >
                      +1
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}

          {/* Leaderboard */}
          <section className="surface-card" style={{ padding: 20, marginTop: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, fontWeight: 700 }}>leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p className="muted">no entries yet. join the challenge and submit your first benchmark!</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                  {leaderboard.map((entry) => (
                  <div
                    key={`${entry.userId}-${entry.rank}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      background: entry.rank <= 3 ? "var(--accent-soft)" : "transparent",
                      borderRadius: "var(--radius)",
                      border: entry.rank <= 3 ? "1px solid var(--accent)" : "1px solid transparent"
                    }}
                  >
                    <Link href={`/user/${entry.userId}`} style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      #{entry.rank} {entry.userId}
                    </Link>
                    <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {entry.points} pts
                    </span>
                    <FollowButton targetUserId={entry.userId} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {status ? <p style={{ color: "var(--accent)", marginTop: 12 }}>{status}</p> : null}
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
