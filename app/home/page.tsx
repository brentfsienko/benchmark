"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { listActivity } from "@/src/lib/api";
import type { ActivityItem } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { FriendNavButton } from "@/src/components/friend-nav-button";
import { trackEvent } from "@/src/lib/analytics";

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25;
  const stars: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push("★");
    else if (i === full && half) stars.push("½");
    else stars.push("☆");
  }
  return <span style={{ color: "var(--accent)", letterSpacing: 1 }}>{stars.join("")}</span>;
}

export default function HomePage() {
  const { profileId, user } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profileId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const id = profileId ?? "user-1";
    listActivity(id, { feed: Boolean(profileId) })
      .then((next) => {
        setItems(next);
        trackEvent({ name: "home_feed_loaded", userId: id, metadata: { count: next.length } });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profileId, user]);

  return (
    <section className="screen">
      <SectionHeader title="home" subtitle="your recent benchmarks" action={<FriendNavButton />} />
      {!user && (
        <div className="surface-card" style={{ padding: 20 }}>
          <p className="muted" style={{ margin: "0 0 12px" }}>sign in to view your feed</p>
          <Link href="/auth/login" className="button-primary">
            sign in
          </Link>
        </div>
      )}
      {loading ? <p className="muted">loading feed…</p> : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      {!user ? null : !loading && items.length === 0 && !error && (
        <div className="surface-card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 32, margin: "0 0 12px" }}>🪑</p>
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>no benchmarks yet</p>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
            find a bench on the map and submit your first benchmark!
          </p>
          <Link href="/explore" className="button-primary">
            explore benches
          </Link>
        </div>
      )}
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {user && items.map((item) => (
          <Link key={item.id} href={`/bench/${item.benchId}`} style={{ display: "block" }}>
            <article className="surface-card" style={{ padding: "var(--space-4)", transition: "transform 0.15s", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{item.benchName}</p>
                {item.rating !== undefined && <StarRating rating={item.rating} />}
              </div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                benchmarked {new Date(item.createdAt).toLocaleDateString()}
              </p>
              {item.author && (
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>
                  by {item.userId === profileId ? "you" : item.author}
                </p>
              )}
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
