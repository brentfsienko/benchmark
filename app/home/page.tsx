"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { listActivity } from "@/src/lib/api";
import type { ActivityItem } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { FriendNavButton } from "@/src/components/friend-nav-button";
import { trackEvent } from "@/src/lib/analytics";

const PAGE_SIZE = 15;

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
  const { profileId, user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profileId) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    listActivity(profileId, { feed: true, limit: PAGE_SIZE })
      .then((next) => {
        if (cancelled) return;
        setItems(next);
        setHasMore(next.length >= PAGE_SIZE);
        trackEvent({
          name: "home_feed_loaded",
          userId: profileId,
          metadata: { count: next.length }
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, profileId, user]);

  const loadMore = async () => {
    if (!profileId || loadingMore || items.length === 0) return;
    const before = items[items.length - 1]?.createdAt;
    if (!before) return;
    setLoadingMore(true);
    try {
      const next = await listActivity(profileId, {
        feed: true,
        limit: PAGE_SIZE,
        before
      });
      setItems((prev) => [...prev, ...next]);
      setHasMore(next.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unable to load feed");
    } finally {
      setLoadingMore(false);
    }
  };

  const showAuthGate = !authLoading && !user;
  const showLoading = authLoading || (Boolean(user && profileId) && loading);

  return (
    <section className="screen">
      <SectionHeader title="home" subtitle="your recent benchmarks" action={<FriendNavButton />} />
      {showAuthGate && (
        <div className="surface-card" style={{ padding: 20 }}>
          <p className="muted" style={{ margin: "0 0 12px" }}>sign in to view your feed</p>
          <Link href="/auth/login" className="button-primary">
            sign in
          </Link>
        </div>
      )}
      {showLoading ? <p className="muted">loading feed…</p> : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      {!showAuthGate && !showLoading && items.length === 0 && !error && user ? (
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
      ) : null}
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {user &&
          items.map((item) => (
            <Link key={item.id} href={`/bench/${item.benchId}`} style={{ display: "block" }}>
              <article
                className="surface-card"
                style={{ padding: "var(--space-4)", transition: "transform 0.15s", cursor: "pointer" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8
                  }}
                >
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
      {user && !showLoading && hasMore ? (
        <button
          type="button"
          className="button-secondary"
          style={{ width: "100%" }}
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "loading…" : "load more"}
        </button>
      ) : null}
    </section>
  );
}
