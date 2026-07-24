"use client";

import Link from "next/link";
import { useEffect, useId } from "react";
import type { Bench, BenchPin, BenchReview } from "@/src/lib/types";

type BenchExploreSheetProps = {
  pin: BenchPin;
  bench: Bench | null;
  reviews: BenchReview[];
  loading: boolean;
  onClose: () => void;
};

function BackIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export function BenchExploreSheet({ pin, bench, reviews, loading, onClose }: BenchExploreSheetProps) {
  const titleId = useId();
  const name = bench?.name ?? pin.name;
  const neighborhood = bench?.neighborhood ?? pin.neighborhood;
  const rating = bench?.averageRating ?? pin.averageRating;
  const description = bench?.description ?? "";
  const type = bench?.type ?? pin.type;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end"
      }}
    >
      <button
        type="button"
        aria-label="Close bench details"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "rgba(35, 32, 27, 0.35)",
          cursor: "pointer",
          padding: 0
        }}
      />
      <div
        className="surface-card"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          margin: "0 auto",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to map"
            title="Back to map"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              border: "1px solid var(--border)",
              background: "var(--elevated)",
              color: "var(--text-primary)",
              cursor: "pointer",
              flexShrink: 0
            }}
          >
            <BackIcon />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: 17,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {name}
            </h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
              {neighborhood} • {type} • {rating.toFixed(1)} ★
            </p>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "14px 16px 24px", WebkitOverflowScrolling: "touch" }}>
          {loading && !bench ? (
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>loading details…</p>
          ) : null}

          {description ? (
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.45 }}>{description}</p>
          ) : !loading ? (
            <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>no description yet</p>
          ) : null}

          <Link
            href={`/bench/${pin.id}`}
            className="button-primary"
            style={{
              display: "block",
              textAlign: "center",
              textDecoration: "none",
              marginBottom: 18,
              width: "100%"
            }}
          >
            submit a benchmark
          </Link>

          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>
            community benchmarks ({reviews.length}{loading && bench ? "…" : ""})
          </h3>
          {loading && reviews.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>no benchmarks yet — be the first!</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {reviews.slice(0, 12).map((review) => (
                <article
                  key={review.id}
                  style={{
                    padding: 12,
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--elevated)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{review.author}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{review.rating.toFixed(1)} ★</span>
                  </div>
                  {review.body ? (
                    <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.4 }}>{review.body}</p>
                  ) : null}
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 11 }}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          )}

          <p className="muted" style={{ margin: "16px 0 0", fontSize: 12, textAlign: "center" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                padding: 0
              }}
            >
              ← back to map
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
