"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getProfile, listFollowers, listFollowing, listActivity } from "@/src/lib/api";
import type { UserProfile, ActivityItem } from "@/src/lib/types";
import { FollowButton } from "@/src/components/follow-button";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      getProfile(userId),
      listFollowers(userId),
      listFollowing(userId),
      listActivity(userId)
    ])
      .then(([p, fers, fing, act]) => {
        setProfile(p);
        setFollowers(fers);
        setFollowing(fing);
        setActivity(act);
      })
      .catch((err: Error) => setError(err.message));
  }, [userId]);

  if (error) {
    return (
      <section className="screen">
        <BenchmarkLogo size={32} />
        <p style={{ color: "var(--danger)", marginTop: 16 }}>{error}</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="screen">
        <BenchmarkLogo size={32} />
        <p className="muted" style={{ marginTop: 16 }}>loading profile…</p>
      </section>
    );
  }

  return (
    <section className="screen">
      <div style={{ marginBottom: 16 }}>
        <BenchmarkLogo size={32} />
      </div>

      {/* Profile header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            border: "2px solid var(--accent)",
            display: "grid",
            placeItems: "center",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--accent)",
            flexShrink: 0
          }}
        >
          {profile.displayName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{profile.displayName}</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>@{profile.username}</p>
          {profile.bio && <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.4 }}>{profile.bio}</p>}
        </div>
      </div>

      {/* Follow button + stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <FollowButton targetUserId={userId} variant="friend" />
        <span className="muted">
          <strong style={{ color: "var(--text-primary)" }}>{followers.length}</strong> followers
        </span>
        <span className="muted">
          <strong style={{ color: "var(--text-primary)" }}>{following.length}</strong> following
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="surface-card" style={{ padding: "12px 16px", textAlign: "center", flex: 1, minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{profile.benchmarkCount ?? profile.benchmarkedBenchIDs.length}</p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>benchmark</p>
        </div>
        <div className="surface-card" style={{ padding: "12px 16px", textAlign: "center", flex: 1, minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{profile.wishlistBenchIDs.length}</p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>wishlist</p>
        </div>
      </div>

      {/* Recent activity */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>recent activity</h2>
      {activity.length === 0 ? (
        <p className="muted">no activity yet</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {activity.slice(0, 10).map((item) => (
            <article key={item.id} className="surface-card" style={{ padding: 12 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                benchmarked{" "}
                <Link href={`/bench/${item.benchId}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                  {item.benchName}
                </Link>
              </p>
              {item.rating !== undefined && (
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  rated {item.rating.toFixed(1)}
                </p>
              )}
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>
                {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
