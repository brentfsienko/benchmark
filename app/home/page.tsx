"use client";

import { useEffect, useState } from "react";
import { env } from "@/src/lib/env";
import { listActivity } from "@/src/lib/api";
import type { ActivityItem } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { trackEvent } from "@/src/lib/analytics";

export default function HomePage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listActivity(env.currentUserID)
      .then((next) => {
        setItems(next);
        trackEvent({ name: "home_feed_loaded", userId: env.currentUserID, metadata: { count: next.length } });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="screen">
      <SectionHeader title="home" subtitle="friends + local activity" />
      {loading ? <p className="muted">loading feed…</p> : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {items.map((item) => (
          <article key={item.id} className="surface-card" style={{ padding: "var(--space-4)" }}>
            <p style={{ margin: 0, fontSize: 13, textTransform: "lowercase" }}>
              {item.type} at <strong>{item.benchName}</strong>
            </p>
            {item.rating !== undefined ? <p style={{ margin: "8px 0 0 0" }}>rating {item.rating.toFixed(1)}</p> : null}
            <p className="muted" style={{ margin: "8px 0 0 0", fontSize: 12 }}>
              {new Date(item.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
