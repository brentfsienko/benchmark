"use client";

import { useParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { addWishlistItem, getBench, listBenchReviews, submitBenchmark } from "@/src/lib/api";
import type { Bench, BenchReview } from "@/src/lib/types";
import { useAuth } from "@/src/contexts/auth-context";
import { trackEvent } from "@/src/lib/analytics";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";
import { FollowButton } from "@/src/components/follow-button";

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 1_500_000;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BenchDetailPage() {
  const params = useParams<{ id: string }>();
  const { profileId } = useAuth();
  const benchID = params.id;
  const [bench, setBench] = useState<Bench | null>(null);
  const [reviews, setReviews] = useState<BenchReview[]>([]);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!benchID) return;
    Promise.all([getBench(benchID), listBenchReviews(benchID)])
      .then(([benchData, reviewData]) => {
        setBench(benchData);
        setReviews(reviewData);
      })
      .catch((err: Error) => setStatus(err.message));
  }, [benchID]);

  const onPhotosSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = files.slice(0, remaining);
    const results: string[] = [];
    for (const file of toProcess) {
      if (file.size > MAX_PHOTO_BYTES) {
        setStatus(`${file.name} is too large (max 1.5 MB)`);
        continue;
      }
      try {
        results.push(await fileToBase64(file));
      } catch {
        setStatus(`could not read ${file.name}`);
      }
    }
    setPhotos((prev) => [...prev, ...results]);
    e.target.value = "";
  }, [photos.length]);

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await submitBenchmark(benchID, {
        rating: Number(rating),
        body,
        photoBase64Items: photos,
        userId: profileId ?? undefined
      });
      const next = await listBenchReviews(benchID);
      setReviews(next);
      setBody("");
      setPhotos([]);
      setStatus("benchmark submitted");
      trackEvent({ name: "benchmark_submitted", userId: profileId ?? "anonymous", benchId: benchID });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to submit benchmark");
    } finally {
      setSubmitting(false);
    }
  };

  const allPhotos = reviews.flatMap((r) =>
    (r.photoBase64Items ?? []).map((src) => ({ src, author: r.author, rating: r.rating }))
  );

  return (
    <section className="screen">
      <div style={{ marginBottom: 12 }}>
        <BenchmarkLogo size={32} />
      </div>
      {bench ? (
        <>
          <h1 style={{ marginTop: 0 }}>{bench.name}</h1>
          <p className="muted">
            {bench.neighborhood} • {bench.type} • {bench.averageRating.toFixed(1)} ★
          </p>
          <p>{bench.description}</p>

          {/* Photo gallery from all benchmarks */}
          {allPhotos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>community photos</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 8
                }}
              >
                {allPhotos.map((photo, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedPhoto(photo.src)}
                    style={{
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      background: "none",
                      borderRadius: "var(--radius)",
                      overflow: "hidden",
                      aspectRatio: "1",
                      position: "relative"
                    }}
                  >
                    <img
                      src={photo.src}
                      alt={`${bench.name} by ${photo.author}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "var(--radius)" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fullscreen photo viewer */}
          {selectedPhoto && (
            <div
              onClick={() => setSelectedPhoto(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                cursor: "pointer"
              }}
            >
              <img
                src={selectedPhoto}
                alt="Full view"
                style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: "var(--radius)", objectFit: "contain" }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <button
              className="button-secondary"
              onClick={() => {
                if (profileId) {
                  addWishlistItem(profileId, benchID)
                    .then(() => setStatus("saved to wishlist"))
                    .catch((err: Error) => setStatus(err.message));
                } else {
                  setStatus("sign in to save to wishlist");
                }
              }}
            >
              save to wishlist
            </button>
          </div>

          {/* Benchmark submission form */}
          <form onSubmit={onSubmit} className="surface-card" style={{ padding: 16, marginBottom: 14 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>submit benchmark</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              rate this bench, leave a note, and attach photos of the view.
            </p>
            <label style={{ display: "block", marginBottom: 12 }}>
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
            <label style={{ display: "block", marginBottom: 12 }}>
              note
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="what's the view like? how did it feel?"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            {/* Photo upload */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>photos</span>
                <span className="muted" style={{ fontSize: 12 }}>{photos.length}/{MAX_PHOTOS}</span>
              </div>
              {photos.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  {photos.map((src, i) => (
                    <div key={i} style={{ position: "relative", width: 72, height: 72 }}>
                      <img
                        src={src}
                        alt={`Upload ${i + 1}`}
                        style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--danger)",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          lineHeight: "20px",
                          textAlign: "center",
                          padding: 0
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < MAX_PHOTOS && (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: "var(--radius)",
                    border: "1px dashed var(--border)",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-secondary)"
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x={3} y={3} width={18} height={18} rx={2} />
                    <circle cx={8.5} cy={8.5} r={1.5} />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  add photo
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onPhotosSelected}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>

            <button className="button-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "submitting…" : "submit benchmark"}
            </button>
          </form>

          {/* Community benchmarks */}
          <section>
            <h2 style={{ fontSize: 16 }}>community benchmarks ({reviews.length})</h2>
            {reviews.length === 0 ? (
              <p className="muted">no benchmarks yet. be the first!</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {reviews.map((review) => (
                  <article key={review.id} className="surface-card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Link
                        href={`/user/${review.userId}`}
                        style={{ fontWeight: 600, color: "var(--accent)", fontSize: 14 }}
                      >
                        {review.author}
                      </Link>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{review.rating.toFixed(1)} ★</span>
                        <FollowButton targetUserId={review.userId} size="sm" />
                      </div>
                    </div>
                    {review.body && (
                      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.4 }}>{review.body}</p>
                    )}
                    {/* Inline photos */}
                    {(review.photoBase64Items ?? []).length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
                        {(review.photoBase64Items ?? []).map((src, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedPhoto(src)}
                            style={{ border: "none", padding: 0, cursor: "pointer", background: "none", flexShrink: 0 }}
                          >
                            <img
                              src={src}
                              alt={`Photo ${i + 1} by ${review.author}`}
                              style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>
                      {new Date(review.createdAt).toLocaleDateString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="muted">loading bench…</p>
      )}
      {status ? <p style={{ color: "var(--accent)" }}>{status}</p> : null}
    </section>
  );
}
