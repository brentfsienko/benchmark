"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { addWishlistItem, getBench, listBenchReviews, submitBenchmark } from "@/src/lib/api";
import type { Bench, BenchReview } from "@/src/lib/types";
import { env } from "@/src/lib/env";
import { trackEvent } from "@/src/lib/analytics";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";

export default function BenchDetailPage() {
  const params = useParams<{ id: string }>();
  const benchID = params.id;
  const [bench, setBench] = useState<Bench | null>(null);
  const [reviews, setReviews] = useState<BenchReview[]>([]);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!benchID) return;
    Promise.all([getBench(benchID), listBenchReviews(benchID)])
      .then(([benchData, reviewData]) => {
        setBench(benchData);
        setReviews(reviewData);
      })
      .catch((err: Error) => setStatus(err.message));
  }, [benchID]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await submitBenchmark(benchID, { rating: Number(rating), body, userId: env.currentUserID });
      const next = await listBenchReviews(benchID);
      setReviews(next);
      setBody("");
      setStatus("benchmark submitted");
      trackEvent({ name: "benchmark_submitted", userId: env.currentUserID, benchId: benchID });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to submit benchmark");
    }
  };

  return (
    <section className="screen">
      <div style={{ marginBottom: 12 }}>
        <BenchmarkLogo size={32} />
      </div>
      {bench ? (
        <>
          <h1 style={{ marginTop: 0 }}>{bench.name}</h1>
          <p className="muted">
            {bench.neighborhood} • {bench.type}
          </p>
          <p>{bench.description}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <button
              className="button-secondary"
              onClick={() => {
                addWishlistItem(env.currentUserID, benchID)
                  .then(() => setStatus("saved to wishlist"))
                  .catch((err: Error) => setStatus(err.message));
              }}
            >
              save to wishlist
            </button>
          </div>
          <form onSubmit={onSubmit} className="surface-card" style={{ padding: 12, marginBottom: 14 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>submit benchmark</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              A benchmark combines visit + review in one action.
            </p>
            <label style={{ display: "block", marginBottom: 8 }}>
              rating
              <input
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                type="number"
                min={0}
                max={5}
                step={0.5}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              note
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ width: "100%", marginTop: 4 }} />
            </label>
            <button className="button-primary" type="submit">
              submit benchmark
            </button>
          </form>
          <section>
            <h2 style={{ fontSize: 16 }}>community benchmarks</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {reviews.map((review) => (
                <article key={review.id} className="surface-card" style={{ padding: 12 }}>
                  <p style={{ margin: 0 }}>{review.author}</p>
                  <p className="muted" style={{ margin: "6px 0 0 0" }}>
                    rating {review.rating.toFixed(1)}
                  </p>
                  {review.body ? <p style={{ marginBottom: 0 }}>{review.body}</p> : null}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="muted">loading bench…</p>
      )}
      {status ? <p style={{ color: "var(--accent)" }}>{status}</p> : null}
    </section>
  );
}
