"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/src/contexts/auth-context";
import {
  getBench,
  getProfile,
  getParkLeaderboard,
  joinChallenge,
  listBenchReviews,
  listChallenges,
  listNearbyBenches
} from "@/src/lib/api";
import type { Bench, BenchReview, Challenge, LeaderboardEntry } from "@/src/lib/types";
import { trackEvent } from "@/src/lib/analytics";
import { FollowButton } from "@/src/components/follow-button";

const GREEN_LAKE_CENTER = { lat: 47.6798, lng: -122.3288 };

function ProgressRing({ progress, total, size = 120 }: { progress: number; total: number; size?: number }) {
  const pct = total > 0 ? Math.min(progress / total, 1) : 0;
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{progress}</span>
        <span className="muted" style={{ fontSize: 11 }}>of {total}</span>
      </div>
    </div>
  );
}

function motivationalCopy(pct: number): string {
  if (pct >= 1) return "challenge complete! you benchmarked every bench. 🏆";
  if (pct >= 0.75) return "almost there! just a few more benches to go.";
  if (pct >= 0.5) return "halfway! you're crushing it.";
  if (pct >= 0.25) return "nice start. keep exploring the lake!";
  if (pct > 0) return "just getting started. go find a bench!";
  return "join the challenge and benchmark your first bench.";
}

type BenchWithStatus = Bench & { benchmarked: boolean; reviewCount: number; topPhoto?: string };

function ChallengesContent() {
  const searchParams = useSearchParams();
  const { profileId } = useAuth();
  const parkID = searchParams.get("park") ?? "green-lake";
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [benchList, setBenchList] = useState<BenchWithStatus[]>([]);
  const [benchmarkedIDs, setBenchmarkedIDs] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listChallenges(parkID),
      getParkLeaderboard(parkID),
      listNearbyBenches({ lat: GREEN_LAKE_CENTER.lat, lng: GREEN_LAKE_CENTER.lng, radiusMeters: 1500 }),
      profileId ? getProfile(profileId).catch(() => null) : Promise.resolve(null)
    ])
      .then(async ([challengeRows, leaderboardRows, nearbyBenches, userProfile]) => {
        const gl = challengeRows.find((c) => c.parkId === "green-lake");
        setChallenge(gl ?? null);
        setLeaderboard(leaderboardRows);

        const bmSet = new Set(userProfile?.benchmarkedBenchIDs ?? []);
        setBenchmarkedIDs(bmSet);

        const isJoined = leaderboardRows.some((e) => e.userId === profileId);
        setJoined(isJoined);

        const enriched: BenchWithStatus[] = await Promise.all(
          nearbyBenches.slice(0, 8).map(async (b) => {
            let reviewCount = 0;
            let topPhoto: string | undefined;
            try {
              const reviews: BenchReview[] = await listBenchReviews(b.id);
              reviewCount = reviews.length;
              for (const r of reviews) {
                if (r.photoBase64Items && r.photoBase64Items.length > 0) {
                  topPhoto = r.photoBase64Items[0];
                  break;
                }
              }
            } catch { /* ignore */ }
            return { ...b, benchmarked: bmSet.has(b.id), reviewCount, topPhoto };
          })
        );

        enriched.sort((a, b) => {
          if (a.benchmarked !== b.benchmarked) return a.benchmarked ? 1 : -1;
          return a.name.localeCompare(b.name);
        });

        setBenchList(enriched);
      })
      .catch((err: Error) => setStatus(err.message))
      .finally(() => setLoading(false));
  }, [parkID, profileId]);

  const totalBenches = benchList.length;
  const completedBenches = benchList.filter((b) => b.benchmarked).length;
  const pct = totalBenches > 0 ? completedBenches / totalBenches : 0;

  const myEntry = leaderboard.find((e) => e.userId === profileId);

  const handleJoin = async () => {
    if (!profileId || !challenge) return;
    try {
      await joinChallenge(challenge.id, profileId);
      setJoined(true);
      setStatus("you're in! go benchmark a bench.");
      trackEvent({ name: "challenge_joined", userId: profileId, metadata: { challengeId: challenge.id } });
      const lb = await getParkLeaderboard(parkID);
      setLeaderboard(lb);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "could not join");
    }
  };

  return (
    <section className="screen">
      <h1 style={{ marginTop: 0, fontSize: 24, fontWeight: 700, textTransform: "lowercase" }}>
        green lake challenge
      </h1>
      <p className="muted" style={{ margin: "0 0 4px", fontSize: 13 }}>
        summer 2026 • benchmark every bench around the lake
      </p>

      {loading ? (
        <p className="muted">loading challenge…</p>
      ) : (
        <>
          {/* Hero section: progress ring + stats */}
          <div
            className="surface-card"
            style={{
              padding: 24,
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
              background: "linear-gradient(135deg, var(--surface) 0%, var(--elevated) 100%)"
            }}
          >
            <ProgressRing progress={completedBenches} total={totalBenches} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                {motivationalCopy(pct)}
              </p>
              {myEntry && (
                <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>#{myEntry.rank}</span>{" "}
                  on the leaderboard • <strong>{myEntry.points}</strong> pts
                </p>
              )}
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                15 pts per benchmark • {totalBenches} benches total
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {!joined && profileId && (
                  <button className="button-primary" onClick={handleJoin} style={{ fontSize: 13 }}>
                    join challenge
                  </button>
                )}
                {!profileId && (
                  <Link href="/auth/login" className="button-primary" style={{ fontSize: 13 }}>
                    sign in to join
                  </Link>
                )}
                <Link href="/explore" className="button-secondary" style={{ fontSize: 13 }}>
                  open map
                </Link>
              </div>
            </div>
          </div>

          {/* Completion celebration */}
          {pct >= 1 && (
            <div
              className="surface-card"
              style={{
                padding: 24,
                textAlign: "center",
                border: "2px solid var(--accent)",
                background: "var(--accent-soft)"
              }}
            >
              <p style={{ fontSize: 40, margin: "0 0 8px" }}>🏆</p>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--accent)" }}>challenge complete!</h2>
              <p className="muted" style={{ margin: 0 }}>
                you benchmarked all {totalBenches} benches. total points: <strong>{myEntry?.points ?? completedBenches * 15}</strong>
              </p>
            </div>
          )}

          {/* Bench checklist */}
          <div style={{ marginTop: 4 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>bench checklist</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {benchList.map((b) => (
                <Link key={b.id} href={`/bench/${b.id}`} style={{ display: "block" }}>
                  <div
                    className="surface-card"
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      opacity: b.benchmarked ? 0.7 : 1,
                      borderLeft: b.benchmarked ? "3px solid var(--accent)" : "3px solid var(--border)"
                    }}
                  >
                    {b.topPhoto ? (
                      <img
                        src={b.topPhoto}
                        alt={b.name}
                        style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          background: b.benchmarked ? "var(--accent-soft)" : "var(--elevated)",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          fontSize: 20
                        }}
                      >
                        {b.benchmarked ? "✓" : "🪑"}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.name}
                      </p>
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                        {b.benchmarked ? `benchmarked • ${b.reviewCount} review${b.reviewCount !== 1 ? "s" : ""}` : "not yet benchmarked"}
                      </p>
                    </div>
                    {b.benchmarked ? (
                      <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 16 }}>✓</span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>go →</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          <div style={{ marginTop: 4 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>leaderboard</h2>
            <div className="surface-card" style={{ padding: 16 }}>
              {leaderboard.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>no entries yet. join the challenge!</p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {leaderboard.map((entry) => {
                    const isMe = entry.userId === profileId;
                    return (
                      <div
                        key={`${entry.userId}-${entry.rank}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 12px",
                          background: isMe ? "var(--accent-soft)" : entry.rank <= 3 ? "var(--elevated)" : "transparent",
                          borderRadius: "var(--radius)",
                          border: isMe ? "1px solid var(--accent)" : entry.rank <= 3 ? "1px solid var(--border)" : "1px solid transparent"
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 14, width: 28 }}>
                          {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
                        </span>
                        <Link
                          href={`/user/${entry.userId}`}
                          style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}
                        >
                          {entry.userId}{isMe ? " (you)" : ""}
                        </Link>
                        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: "var(--accent)" }}>
                          {entry.points} pts
                        </span>
                        {!isMe && <FollowButton targetUserId={entry.userId} size="sm" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {status ? <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 13 }}>{status}</p> : null}
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
