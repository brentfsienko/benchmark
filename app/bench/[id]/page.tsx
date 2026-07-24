"use client";

import { useParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addWishlistItem, getBench, listBenchReviews, listWishlist, removeWishlistItem, submitBenchmark } from "@/src/lib/api";
import type { Bench, BenchReview } from "@/src/lib/types";
import { useAuth } from "@/src/contexts/auth-context";
import { trackEvent } from "@/src/lib/analytics";
import {
  BENCHMARK_GEOFENCE_METERS,
  distanceMeters,
  formatDistanceMeters,
  isWithinGeofence
} from "@/src/lib/geo";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";
import { FollowButton } from "@/src/components/follow-button";
import { MiniBenchMap } from "@/src/components/mini-bench-map";
import { Toast } from "@/src/components/toast";

type ProximityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "within"; distance: number }
  | { status: "outside"; distance: number }
  | { status: "denied" }
  | { status: "unavailable"; message: string };

function readCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("location is unavailable on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 15_000
    });
  });
}

const MAX_PHOTOS = 4;
const MAX_ORIGINAL_PHOTO_BYTES = 20_000_000;
const MAX_PHOTO_BASE64_CHARS = 1_700_000;
const MAX_IMAGE_DIMENSION = 1600;

const RATING_LABELS: Record<string, string> = {
  "1": "hard pass",
  "1.5": "not great",
  "2": "meh",
  "2.5": "it's okay",
  "3": "decent sit",
  "3.5": "pretty nice",
  "4": "great bench",
  "4.5": "amazing",
  "5": "life-changing"
};

const RATING_EMOJI: Record<string, string> = {
  "1": "😬", "1.5": "😕", "2": "😐", "2.5": "🙂",
  "3": "😊", "3.5": "😄", "4": "🤩", "4.5": "🥳", "5": "🪑✨"
};

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image"));
    };
    image.src = url;
  });
}

async function optimizePhotoForUpload(file: File): Promise<string> {
  const image = await loadImageFromFile(file);
  const maxEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / maxEdge);
  const qualities = [0.82, 0.74, 0.66, 0.58];

  for (let sizeStep = 0; sizeStep < 3; sizeStep++) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to process image");
    ctx.drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_PHOTO_BASE64_CHARS) {
        return dataUrl;
      }
    }
    scale *= 0.8;
  }
  throw new Error("Photo is still too large after optimization");
}

export default function BenchDetailPage() {
  const params = useParams<{ id: string }>();
  const { profileId } = useAuth();
  const benchID = params.id;
  const [bench, setBench] = useState<Bench | null>(null);
  const [reviews, setReviews] = useState<BenchReview[]>([]);
  const [rating, setRating] = useState(4);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showAllPhotosModal, setShowAllPhotosModal] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastKey = useRef(0);
  const [proximity, setProximity] = useState<ProximityState>({ status: "idle" });
  const benchCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!benchID) return;
    Promise.all([getBench(benchID), listBenchReviews(benchID)])
      .then(([benchData, reviewData]) => {
        setBench(benchData);
        setReviews(reviewData);
        benchCoordsRef.current = {
          latitude: benchData.latitude,
          longitude: benchData.longitude
        };
      })
      .catch((err: Error) => setStatus(err.message));
  }, [benchID]);

  useEffect(() => {
    if (!profileId || !bench) return;
    if (!("geolocation" in navigator)) {
      setProximity({ status: "unavailable", message: "location is unavailable on this device" });
      return;
    }

    setProximity({ status: "checking" });
    const benchPos = { latitude: bench.latitude, longitude: bench.longitude };

    const applyPosition = (pos: GeolocationPosition) => {
      const userPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const distance = distanceMeters(userPos, benchPos);
      setProximity(
        isWithinGeofence(userPos, benchPos)
          ? { status: "within", distance }
          : { status: "outside", distance }
      );
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setProximity({ status: "denied" });
      } else {
        setProximity({
          status: "unavailable",
          message: "couldn't get your location — try again near the bench"
        });
      }
    };

    const watchId = navigator.geolocation.watchPosition(applyPosition, onError, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 10_000
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [profileId, bench]);

  useEffect(() => {
    if (!profileId) return;
    listWishlist(profileId)
      .then((ids) => setWishlisted(ids.includes(benchID)))
      .catch(() => {});
  }, [profileId, benchID]);

  const toggleWishlist = useCallback(async () => {
    if (!profileId) {
      toastKey.current++;
      setToast("sign in to save to wishlist");
      return;
    }
    setWishlistLoading(true);
    try {
      if (wishlisted) {
        await removeWishlistItem(profileId, benchID);
        setWishlisted(false);
        toastKey.current++;
        setToast("removed from wishlist");
      } else {
        await addWishlistItem(profileId, benchID);
        setWishlisted(true);
        toastKey.current++;
        setToast("saved to wishlist ♥");
        trackEvent({ name: "wishlist_added", benchId: benchID, userId: profileId });
      }
    } catch (err) {
      toastKey.current++;
      setToast(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setWishlistLoading(false);
    }
  }, [profileId, benchID, wishlisted]);

  const onPhotosSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = files.slice(0, remaining);
    const results: string[] = [];
    for (const file of toProcess) {
      if (file.size > MAX_ORIGINAL_PHOTO_BYTES) {
        setStatus(`${file.name} is too large (max 20 MB before optimization)`);
        continue;
      }
      try {
        const optimized = await optimizePhotoForUpload(file);
        results.push(optimized);
      } catch {
        try {
          const fallback = await fileToBase64(file);
          if (fallback.length <= MAX_PHOTO_BASE64_CHARS) {
            results.push(fallback);
          } else {
            setStatus(`${file.name} is too large after optimization`);
          }
        } catch {
          setStatus(`could not read ${file.name}`);
        }
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
    if (!profileId) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const position = await readCurrentPosition();
      const userPos = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      const benchPos = benchCoordsRef.current ?? (bench
        ? { latitude: bench.latitude, longitude: bench.longitude }
        : null);
      if (!benchPos) throw new Error("bench location unavailable");

      const distance = distanceMeters(userPos, benchPos);
      if (!isWithinGeofence(userPos, benchPos)) {
        setProximity({ status: "outside", distance });
        throw new Error(
          `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark (you're about ${formatDistanceMeters(distance)} away)`
        );
      }

      await submitBenchmark(benchID, {
        rating,
        body,
        photoBase64Items: photos,
        userId: profileId,
        latitude: userPos.latitude,
        longitude: userPos.longitude
      });
      const next = await listBenchReviews(benchID);
      setReviews(next);
      setBody("");
      setPhotos([]);
      setRating(4);
      toastKey.current++;
      setToast("benchmark submitted! nice sit.");
      trackEvent({ name: "benchmark_submitted", userId: profileId, benchId: benchID });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        const geoErr = err as GeolocationPositionError;
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setProximity({ status: "denied" });
          setStatus("location permission is required to submit a benchmark");
        } else {
          setStatus("couldn't get your location — try again near the bench");
        }
      } else {
        setStatus(err instanceof Error ? err.message : "unable to submit benchmark");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(profileId) &&
    !submitting &&
    proximity.status === "within";

  const proximityMessage = (() => {
    switch (proximity.status) {
      case "checking":
        return "checking if you're near this bench…";
      case "within":
        return `you're within range (~${formatDistanceMeters(proximity.distance)} away)`;
      case "outside":
        return `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark (you're about ${formatDistanceMeters(proximity.distance)} away)`;
      case "denied":
        return `enable location access to submit a benchmark — you must be within ${BENCHMARK_GEOFENCE_METERS}m of the bench`;
      case "unavailable":
        return proximity.message;
      default:
        return `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark`;
    }
  })();

  const ratingKey = String(rating);
  const ratingLabel = RATING_LABELS[ratingKey] ?? "";
  const ratingEmoji = RATING_EMOJI[ratingKey] ?? "🪑";
  const fillPct = ((rating - 1) / 4) * 100;

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <h1 style={{ marginTop: 0, marginBottom: 4 }}>{bench.name}</h1>
              <p className="muted" style={{ margin: 0 }}>
                {bench.neighborhood} • {bench.type} • {bench.averageRating.toFixed(1)} ★
              </p>
            </div>
            <button
              type="button"
              className={`wishlist-btn${wishlisted ? " saved" : ""}`}
              onClick={toggleWishlist}
              disabled={wishlistLoading}
              style={{ flexShrink: 0, marginTop: 4 }}
            >
              <span className="heart-icon" key={wishlisted ? "filled" : "outline"}>
                <HeartIcon filled={wishlisted} />
              </span>
              {wishlisted ? "saved" : "save"}
            </button>
          </div>
          <p style={{ marginTop: 8 }}>{bench.description}</p>

          <section className="surface-card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 14 }}>bench location</h2>
              <Link
                href={`https://www.google.com/maps/search/?api=1&query=${bench.latitude},${bench.longitude}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}
              >
                open maps →
              </Link>
            </div>
            <div style={{ borderRadius: "calc(var(--radius) - 2px)", overflow: "hidden", border: "1px solid var(--border)", height: 160 }}>
              <MiniBenchMap latitude={bench.latitude} longitude={bench.longitude} markerLabel={bench.name} />
            </div>
          </section>

          {allPhotos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>community photos</h2>
              <div className="photo-row-shell">
                <div className="photo-row-scroll">
                  {allPhotos.slice(0, 6).map((photo, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedPhoto(photo.src)}
                      style={{
                        border: "none", padding: 0, cursor: "pointer", background: "none", flexShrink: 0,
                        borderRadius: "var(--radius)", overflow: "hidden", width: 94, height: 94
                      }}
                    >
                      <img
                        src={photo.src}
                        alt={`${bench.name} by ${photo.author}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "var(--radius)" }}
                      />
                    </button>
                  ))}
                  {allPhotos.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPhotosModal(true)}
                      style={{
                        flexShrink: 0,
                        width: 94,
                        height: 94,
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "rgba(96,88,71,0.35)",
                        color: "#f6f5f1",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        textAlign: "center",
                        padding: 8
                      }}
                    >
                      click for more
                    </button>
                  )}
                </div>
                <div className="photo-row-fade" />
              </div>
            </div>
          )}

          {showAllPhotosModal && (
            <div
              onClick={() => setShowAllPhotosModal(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 110,
                background: "rgba(0,0,0,0.8)", padding: 16, overflowY: "auto"
              }}
            >
              <div
                className="surface-card"
                style={{ maxWidth: 760, margin: "20px auto", padding: 14 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>all community photos</h3>
                  <button type="button" className="button-secondary" onClick={() => setShowAllPhotosModal(false)} style={{ height: 30 }}>
                    close
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                  {allPhotos.map((photo, i) => (
                    <button
                      key={`all-${i}`}
                      type="button"
                      onClick={() => {
                        setShowAllPhotosModal(false);
                        setSelectedPhoto(photo.src);
                      }}
                      style={{ border: "none", padding: 0, background: "none", cursor: "pointer" }}
                    >
                      <img
                        src={photo.src}
                        alt={`Community photo ${i + 1}`}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedPhoto && (
            <div
              onClick={() => setSelectedPhoto(null)}
              style={{
                position: "fixed", inset: 0, zIndex: 100,
                background: "rgba(0,0,0,0.85)", display: "flex",
                alignItems: "center", justifyContent: "center",
                padding: 20, cursor: "pointer"
              }}
            >
              <img
                src={selectedPhoto}
                alt="Full view"
                style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: "var(--radius)", objectFit: "contain" }}
              />
            </div>
          )}

          {/* Benchmark submission form */}
          <form onSubmit={onSubmit} className="surface-card" style={{ padding: 18, marginBottom: 14 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>submit benchmark</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              rate this bench, leave a note, and attach photos of the view.
            </p>

            {profileId && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background:
                    proximity.status === "within"
                      ? "var(--accent-soft, rgba(45, 106, 79, 0.12))"
                      : "var(--elevated, rgba(0,0,0,0.04))",
                  fontSize: 13,
                  lineHeight: 1.4,
                  color:
                    proximity.status === "within" ? "var(--accent)" : "var(--text-secondary)"
                }}
              >
                {proximityMessage}
              </div>
            )}

            {/* Rating slider */}
            <div className="rating-slider-container" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>rating</span>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{ratingEmoji}</span>
                </div>
              </div>
              <div style={{ textAlign: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700 }}>{rating.toFixed(1)}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", marginLeft: 8 }}>
                  {ratingLabel}
                </span>
              </div>
              <div className="rating-slider-track">
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={rating}
                  onChange={(e) => setRating(parseFloat(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${fillPct}%, var(--border) ${fillPct}%, var(--border) 100%)`
                  }}
                />
              </div>
              <div className="rating-slider-labels">
                <span>1.0</span>
                <span>2.0</span>
                <span>3.0</span>
                <span>4.0</span>
                <span>5.0</span>
              </div>
            </div>

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
                          position: "absolute", top: -6, right: -6,
                          width: 20, height: 20, borderRadius: "50%",
                          background: "var(--danger)", color: "white",
                          border: "none", cursor: "pointer",
                          fontSize: 12, lineHeight: "20px", textAlign: "center", padding: 0
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < MAX_PHOTOS && (
                <>
                  <label
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 12px", borderRadius: "var(--radius)",
                      border: "1px dashed var(--border)", cursor: "pointer",
                      fontSize: 13, color: "var(--text-secondary)"
                    }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x={3} y={3} width={18} height={18} rx={2} />
                      <circle cx={8.5} cy={8.5} r={1.5} />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    add photo
                    <input type="file" accept="image/*" multiple onChange={onPhotosSelected} style={{ display: "none" }} />
                  </label>
                </>
              )}
            </div>

            {profileId ? (
              <button className="button-primary" type="submit" disabled={!canSubmit} style={{ width: "100%" }}>
                {submitting
                  ? "submitting…"
                  : proximity.status === "checking"
                    ? "checking location…"
                    : proximity.status === "outside"
                      ? "too far to submit"
                      : proximity.status === "denied" || proximity.status === "unavailable"
                        ? "location required"
                        : "submit benchmark"}
              </button>
            ) : (
              <Link
                href={`/auth/login?next=/bench/${benchID}`}
                className="button-primary"
                style={{ width: "100%", display: "block", textAlign: "center", textDecoration: "none" }}
              >
                sign in to submit a benchmark
              </Link>
            )}
          </form>

          {/* Community benchmarks */}
          <section>
            <h2 style={{ fontSize: 16 }}>community benchmarks ({reviews.length})</h2>
            {reviews.length === 0 ? (
              <p className="muted">no benchmarks yet. be the first!</p>
            ) : (
              <div className="benchmark-carousel" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                {reviews.map((review) => (
                  <article key={review.id} className="surface-card" style={{ padding: 14, width: 280, flexShrink: 0, scrollSnapAlign: "start" }}>
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
      {status && <p style={{ color: "var(--accent)" }}>{status}</p>}
      {toast && <Toast key={toastKey.current} message={toast} onDone={() => setToast(null)} />}
    </section>
  );
}
