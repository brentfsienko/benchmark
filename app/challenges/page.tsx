"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/src/contexts/auth-context";
import {
  getBenchSummaries,
  getProfile,
  getParkLeaderboard,
  joinChallenge,
  listChallenges,
  listNearbyBenches
} from "@/src/lib/api";
import type { Bench, Challenge, LeaderboardEntry } from "@/src/lib/types";
import { trackEvent } from "@/src/lib/analytics";
import { FollowButton } from "@/src/components/follow-button";

const GREEN_LAKE_CENTER = { lat: 47.6798, lng: -122.3288 };
const GREEN_LAKE_CHALLENGE_ID = "challenge-gl-summer-2025";

const ACHIEVEMENTS = [
  { id: "first-sit", label: "first sit", icon: "🪑", threshold: 1 },
  { id: "halfway", label: "halfway", icon: "🔥", threshold: 4 },
  { id: "almost", label: "almost!", icon: "⚡", threshold: 7 },
  { id: "circuit", label: "the loop", icon: "🏆", threshold: 8 }
] as const;

function ProgressRing({ progress, total, size = 110 }: { progress: number; total: number; size?: number }) {
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
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center"
        }}
      >
        <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{progress}</span>
        <span className="muted" style={{ fontSize: 11 }}>of {total}</span>
      </div>
    </div>
  );
}

function motivationalCopy(pct: number): string {
  if (pct >= 1) return "you did it! every bench, benchmarked.";
  if (pct >= 0.75) return "so close! the finish line is calling.";
  if (pct >= 0.5) return "halfway around the lake. keep going!";
  if (pct >= 0.25) return "nice momentum. the lake awaits!";
  if (pct > 0) return "first bench down! keep exploring.";
  return "the lake awaits. find your first bench!";
}

type BenchWithStatus = Bench & { benchmarked: boolean; reviewCount: number; topPhoto?: string };
type UpcomingChallenge = {
  id: string;
  title: string;
  description: string;
};

const UPCOMING_CHALLENGES: UpcomingChallenge[] = [
  {
    id: "challenge-arboretum-summer-2026",
    title: "Arboretum Bench Challenge",
    description: "Explore the Arboretum path network and benchmark key waterside benches."
  },
  {
    id: "challenge-seattle-scavenger-summer-2026",
    title: "Seattle Scavenger Hunt",
    description: "A city-wide hunt across hidden benches with clue-based check-ins."
  }
];

function ChallengesContent() {
  const searchParams = useSearchParams();
  const { profileId } = useAuth();
  const selectedChallengeId = searchParams.get("challenge");
  const [allChallenges, setAllChallenges] = useState<Challenge[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [benchList, setBenchList] = useState<BenchWithStatus[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listChallenges(undefined, true),
      getParkLeaderboard("green-lake"),
      listNearbyBenches({ lat: GREEN_LAKE_CENTER.lat, lng: GREEN_LAKE_CENTER.lng, radiusMeters: 1500 }),
      profileId ? getProfile(profileId).catch(() => null) : Promise.resolve(null)
    ])
      .then(async ([challengeRows, leaderboardRows, nearbyBenches, userProfile]) => {
        setAllChallenges(challengeRows);
        const gl = challengeRows.find((c) => c.id === GREEN_LAKE_CHALLENGE_ID || c.parkId === "green-lake");
        setChallenge(gl ?? null);
        setLeaderboard(leaderboardRows);

        const bmSet = new Set(userProfile?.benchmarkedBenchIDs ?? []);

        const isJoined = leaderboardRows.some((e) => e.userId === profileId);
        setJoined(isJoined);

        const top8 = nearbyBenches.slice(0, 8);
        const summaries = await getBenchSummaries(top8.map((b) => b.id)).catch(() => []);
        const summaryMap = new Map(summaries.map((s) => [s.benchId, s]));

        const enriched: BenchWithStatus[] = top8.map((b) => {
          const s = summaryMap.get(b.id);
          return {
            ...b,
            benchmarked: bmSet.has(b.id),
            reviewCount: s?.reviewCount ?? 0,
            topPhoto: s?.topPhoto ?? undefined
          };
        });

        enriched.sort((a, b) => a.name.localeCompare(b.name));
        setBenchList(enriched);
      })
      .catch((err: Error) => setStatus(err.message))
      .finally(() => setLoading(false));
  }, [profileId]);

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
      const lb = await getParkLeaderboard("green-lake");
      setLeaderboard(lb);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "could not join");
    }
  };

  const now = new Date();
  const isCompletedByUser = completedBenches > 0 && totalBenches > 0 && completedBenches >= totalBenches;
  const visibleChallenges = allChallenges.filter((c) => c.id !== "challenge-vp-summer-launch");
  const activeChallenges = visibleChallenges.filter(
    (c) => c.isActive && new Date(c.startsAt) <= now && new Date(c.endsAt) >= now && !(c.id === GREEN_LAKE_CHALLENGE_ID && isCompletedByUser)
  );
  const inactiveUpcomingChallenges = visibleChallenges.filter(
    (c) => new Date(c.startsAt) > now || (!c.isActive && new Date(c.endsAt) >= now)
  );
  const completedChallenges = visibleChallenges.filter((c) => c.id === GREEN_LAKE_CHALLENGE_ID && isCompletedByUser);
  const pastChallenges = visibleChallenges.filter((c) => new Date(c.endsAt) < now && !(c.id === GREEN_LAKE_CHALLENGE_ID && isCompletedByUser));

  const selectedChallenge = selectedChallengeId
    ? allChallenges.find((c) => c.id === selectedChallengeId) ?? null
    : null;
  const showLanding = !selectedChallengeId;
  const canOpenDetailedProgress = selectedChallenge?.id === GREEN_LAKE_CHALLENGE_ID;

  if (loading) {
    return (
      <section className="screen">
        <h1 style={{ marginTop: 0, fontSize: 22, fontWeight: 700, textTransform: "lowercase" }}>play</h1>
        <p className="muted">loading challenges…</p>
      </section>
    );
  }

  if (showLanding) {
    return (
      <section className="screen">
        <h1 style={{ marginTop: 0, fontSize: 22, fontWeight: 700, textTransform: "lowercase" }}>play</h1>
        <p className="muted" style={{ marginTop: 0 }}>choose a challenge</p>

        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px", textTransform: "lowercase" }}>active</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {activeChallenges.length === 0 ? <p className="muted" style={{ margin: 0 }}>no active challenges</p> : null}
            {activeChallenges.map((c) => (
              <Link key={c.id} href={`/challenges?challenge=${encodeURIComponent(c.id)}`} style={{ textDecoration: "none" }}>
                <div className="surface-card" style={{ padding: 14, borderLeft: "3px solid var(--accent)" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{c.title}</p>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{c.description}</p>
                  {c.id === GREEN_LAKE_CHALLENGE_ID && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                      your progress: {completedBenches}/{Math.max(totalBenches, 8)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px", textTransform: "lowercase" }}>upcoming / inactive</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {inactiveUpcomingChallenges.map((c) => (
              <Link key={c.id} href={`/challenges?challenge=${encodeURIComponent(c.id)}`} style={{ textDecoration: "none" }}>
                <div className="surface-card" style={{ padding: 14, borderLeft: "3px solid var(--border)" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{c.title}</p>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{c.description}</p>
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>
                    starts {new Date(c.startsAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
            {UPCOMING_CHALLENGES.map((c) => (
              <div key={c.id} className="surface-card" style={{ padding: 14, opacity: 0.55, borderLeft: "3px solid var(--border)" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{c.title}</p>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{c.description}</p>
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>date tbd</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px", textTransform: "lowercase" }}>completed</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {completedChallenges.length === 0 ? <p className="muted" style={{ margin: 0 }}>no completed challenges yet</p> : null}
            {completedChallenges.map((c) => (
              <Link key={c.id} href={`/challenges?challenge=${encodeURIComponent(c.id)}`} style={{ textDecoration: "none" }}>
                <div className="surface-card" style={{ padding: 14, borderLeft: "3px solid var(--accent)", background: "var(--accent-soft)" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{c.title} ✅</p>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{c.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px", textTransform: "lowercase" }}>past</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {pastChallenges.length === 0 ? <p className="muted" style={{ margin: 0 }}>no past challenges</p> : null}
            {pastChallenges.map((c) => (
              <Link key={c.id} href={`/challenges?challenge=${encodeURIComponent(c.id)}`} style={{ textDecoration: "none" }}>
                <div className="surface-card" style={{ padding: 14, opacity: 0.8, borderLeft: "3px solid var(--border)" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{c.title}</p>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{c.description}</p>
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>
                    ended {new Date(c.endsAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </section>
    );
  }

  if (!selectedChallenge) {
    return (
      <section className="screen">
        <h1 style={{ marginTop: 0, textTransform: "lowercase" }}>challenge not found</h1>
        <Link href="/challenges" className="button-secondary">back to challenges</Link>
      </section>
    );
  }

  if (!canOpenDetailedProgress) {
    return (
      <section className="screen">
        <Link href="/challenges" className="button-secondary" style={{ display: "inline-block", marginBottom: 10 }}>← all challenges</Link>
        <h1 style={{ marginTop: 0, fontSize: 22, fontWeight: 700, textTransform: "lowercase" }}>
          {selectedChallenge.title}
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>{selectedChallenge.description}</p>
        <div className="surface-card" style={{ padding: 16 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            this challenge page is coming soon. launch date:{" "}
            <strong>{new Date(selectedChallenge.startsAt).toLocaleDateString()}</strong>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <Link href="/challenges" className="button-secondary" style={{ display: "inline-block", marginBottom: 10 }}>← all challenges</Link>
      <h1 style={{ marginTop: 0, fontSize: 22, fontWeight: 700, textTransform: "lowercase" }}>
        green lake challenge
      </h1>
      <p className="muted" style={{ margin: "0 0 4px", fontSize: 13 }}>
        trial season • benchmark every bench around the lake
      </p>

      {loading ? (
        <p className="muted">loading challenge…</p>
      ) : (
        <>
          {/* Hero: progress ring + motivational text */}
          <div
            className="surface-card"
            style={{
              padding: 20,
              display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
              background: "linear-gradient(135deg, var(--surface) 0%, var(--elevated) 100%)"
            }}
          >
            <ProgressRing progress={completedBenches} total={totalBenches} />
            <div style={{ flex: 1, minWidth: 150 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                {motivationalCopy(pct)}
              </p>
              {myEntry && (
                <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>#{myEntry.rank}</span>{" "}
                  on the leaderboard • <strong>{myEntry.points}</strong> pts
                </p>
              )}
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                15 pts per benchmark • {totalBenches} benches
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
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

          {/* Trail progress — visual "stepping stones" around the lake */}
          <div className="surface-card" style={{ padding: "16px 12px", overflow: "hidden" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px 4px", textTransform: "lowercase" }}>
              the trail
            </h2>
            <div className="trail-progress">
              {benchList.map((b, i) => {
                const prevDone = i > 0 && benchList[i - 1].benchmarked;
                const shortName = b.name.replace(/ Bench$/i, "").replace(/Green Lake /i, "");
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center" }}>
                    {i > 0 && (
                      <div className={`trail-connector${prevDone && b.benchmarked ? " completed" : ""}`} />
                    )}
                    <Link href={`/bench/${b.id}`} style={{ textDecoration: "none" }}>
                      <div className="trail-stop">
                        <div className={`trail-dot${b.benchmarked ? " completed" : ""}`}>
                          {b.benchmarked ? "✓" : i + 1}
                        </div>
                        <span className="trail-label">{shortName}</span>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Achievement badges */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, textTransform: "lowercase" }}>
              achievements
            </h2>
            <div className="badge-row">
              {ACHIEVEMENTS.map((a) => {
                const earned = completedBenches >= a.threshold;
                return (
                  <div key={a.id} className={`badge${earned ? " earned" : ""}`}>
                    <span className="badge-icon" style={{ opacity: earned ? 1 : 0.3 }}>{a.icon}</span>
                    <span className="badge-label">{a.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Completion celebration */}
          {pct >= 1 && (
            <div
              className="surface-card"
              style={{
                padding: 24, textAlign: "center",
                border: "2px solid var(--accent)", background: "var(--accent-soft)"
              }}
            >
              <p style={{ fontSize: 40, margin: "0 0 8px" }}>🏆</p>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--accent)" }}>circuit complete!</h2>
              <p className="muted" style={{ margin: 0 }}>
                all {totalBenches} benches benchmarked • <strong>{myEntry?.points ?? completedBenches * 15}</strong> points earned
              </p>
            </div>
          )}

          {/* Bench checklist */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, textTransform: "lowercase" }}>
              bench checklist
            </h2>
            <div style={{ display: "grid", gap: 8 }}>
              {benchList.map((b) => (
                <Link key={b.id} href={`/bench/${b.id}`} style={{ display: "block", textDecoration: "none" }}>
                  <div
                    className="surface-card"
                    style={{
                      padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
                      opacity: b.benchmarked ? 0.75 : 1,
                      borderLeft: b.benchmarked ? "3px solid var(--accent)" : "3px solid var(--border)"
                    }}
                  >
                    {b.topPhoto ? (
                      <img
                        src={b.topPhoto} alt={b.name}
                        style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: 10,
                          background: b.benchmarked ? "var(--accent-soft)" : "var(--elevated)",
                          display: "grid", placeItems: "center", flexShrink: 0, fontSize: 20
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
                        {b.benchmarked
                          ? `benchmarked • ${b.reviewCount} review${b.reviewCount !== 1 ? "s" : ""}`
                          : `${b.averageRating.toFixed(1)} ★ • not yet benchmarked`}
                      </p>
                    </div>
                    {b.benchmarked ? (
                      <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 16 }}>✓</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" }}>go →</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, textTransform: "lowercase" }}>
              leaderboard
            </h2>

            {/* Podium for top 3 */}
            {leaderboard.length >= 3 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
                {[1, 0, 2].map((idx) => {
                  const e = leaderboard[idx];
                  if (!e) return null;
                  const isMe = e.userId === profileId;
                  const heights = [88, 72, 60];
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div
                      key={e.userId}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        width: idx === 0 ? 100 : 80
                      }}
                    >
                      <span style={{ fontSize: idx === 0 ? 28 : 22, marginBottom: 4 }}>{medals[idx]}</span>
                      <div
                        className="surface-card"
                        style={{
                          width: "100%", height: heights[idx], display: "flex",
                          flexDirection: "column", alignItems: "center", justifyContent: "center",
                          borderRadius: "12px 12px 4px 4px",
                          background: isMe ? "var(--accent-soft)" : "var(--surface)",
                          border: isMe ? "1.5px solid var(--accent)" : "1px solid var(--border)"
                        }}
                      >
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{e.points}</span>
                        <span className="muted" style={{ fontSize: 9 }}>pts</span>
                      </div>
                      <Link
                        href={`/user/${e.userId}`}
                        style={{
                          fontSize: 10, fontWeight: 600, marginTop: 4,
                          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: isMe ? "var(--accent)" : "var(--text-primary)"
                        }}
                      >
                        {isMe ? "you" : e.userId.slice(0, 12)}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="surface-card" style={{ padding: 12 }}>
              {leaderboard.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>no entries yet. join the challenge!</p>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  {leaderboard.map((entry) => {
                    const isMe = entry.userId === profileId;
                    return (
                      <div
                        key={`${entry.userId}-${entry.rank}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 10px", borderRadius: 10,
                          background: isMe ? "var(--accent-soft)" : "transparent",
                          border: isMe ? "1px solid var(--accent)" : "1px solid transparent"
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 13, width: 28, textAlign: "center", flexShrink: 0 }}>
                          {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
                        </span>
                        <Link
                          href={`/user/${entry.userId}`}
                          style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}
                        >
                          {entry.userId}{isMe ? " (you)" : ""}
                        </Link>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>
                          {entry.points} pts
                        </span>
                        <div style={{
                          width: 40, height: 6, borderRadius: 3,
                          background: "var(--border)", overflow: "hidden", flexShrink: 0
                        }}>
                          <div style={{
                            width: `${Math.min((entry.progress / totalBenches) * 100, 100)}%`,
                            height: "100%", background: "var(--accent)", borderRadius: 3,
                            transition: "width 0.5s ease"
                          }} />
                        </div>
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
      {status && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 13 }}>{status}</p>}
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
