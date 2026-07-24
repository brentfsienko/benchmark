"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { listBenchReviews, submitBenchmark } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth-context";
import { trackEvent } from "@/src/lib/analytics";
import {
  BENCHMARK_GEOFENCE_METERS,
  distanceMeters,
  formatDistanceMeters,
  isWithinGeofence
} from "@/src/lib/geo";
import type { Bench, BenchPin, BenchReview } from "@/src/lib/types";

type BenchExploreSheetProps = {
  pin: BenchPin;
  bench: Bench | null;
  reviews: BenchReview[];
  loading: boolean;
  onClose: () => void;
  onReviewsUpdated?: (reviews: BenchReview[]) => void;
};

type SheetMode = "overview" | "submit";

type ProximityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "within"; distance: number }
  | { status: "outside"; distance: number }
  | { status: "denied" }
  | { status: "unavailable"; message: string };

const PEEK_VH = 52;
const EXPANDED_VH = 92;
const MAX_PHOTOS = 4;
const MAX_ORIGINAL_PHOTO_BYTES = 20_000_000;
const MAX_PHOTO_BASE64_CHARS = 1_700_000;

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

function BackIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function BenchExploreSheet({
  pin,
  bench,
  reviews,
  loading,
  onClose,
  onReviewsUpdated
}: BenchExploreSheetProps) {
  const { profileId } = useAuth();
  const titleId = useId();
  const name = bench?.name ?? pin.name;
  const neighborhood = bench?.neighborhood ?? pin.neighborhood;
  const rating = bench?.averageRating ?? pin.averageRating;
  const description = bench?.description ?? "";
  const type = bench?.type ?? pin.type;
  const reviewCount = reviews.length;

  const [mode, setMode] = useState<SheetMode>("overview");
  const [heightVh, setHeightVh] = useState(PEEK_VH);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartVh = useRef(PEEK_VH);
  const contentRef = useRef<HTMLDivElement>(null);

  const [submitRating, setSubmitRating] = useState(4);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [proximity, setProximity] = useState<ProximityState>({ status: "idle" });
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const previewPhotos = useMemo(() => {
    const out: { src: string; author: string }[] = [];
    for (const review of reviews) {
      for (const src of review.photoBase64Items ?? []) {
        out.push({ src, author: review.author });
        if (out.length >= 8) return out;
      }
    }
    return out;
  }, [reviews]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "submit") setMode("overview");
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, mode]);

  useEffect(() => {
    if (mode !== "submit" || !profileId || !bench) {
      setProximity({ status: "idle" });
      return;
    }
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
      if (err.code === err.PERMISSION_DENIED) setProximity({ status: "denied" });
      else setProximity({ status: "unavailable", message: "couldn't get your location — try again near the bench" });
    };
    const watchId = navigator.geolocation.watchPosition(applyPosition, onError, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 10_000
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, profileId, bench]);

  useEffect(() => {
    if (mode === "submit") {
      setHeightVh(EXPANDED_VH);
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, [mode]);

  const snapToNearest = useCallback((vh: number) => {
    const mid = (PEEK_VH + EXPANDED_VH) / 2;
    setHeightVh(vh >= mid ? EXPANDED_VH : PEEK_VH);
  }, []);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "submit") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartY.current = e.clientY;
    dragStartVh.current = heightVh;
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const deltaPx = dragStartY.current - e.clientY;
    const deltaVh = (deltaPx / window.innerHeight) * 100;
    setHeightVh(clamp(dragStartVh.current + deltaVh, PEEK_VH - 8, EXPANDED_VH + 2));
  };

  const onHandlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    const deltaPx = dragStartY.current - e.clientY;
    if (deltaPx < -90 && heightVh < PEEK_VH + 4) {
      onClose();
      return;
    }
    snapToNearest(heightVh);
  };

  const onPhotosSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photos.length;
    const results: string[] = [];
    for (const file of files.slice(0, remaining)) {
      if (file.size > MAX_ORIGINAL_PHOTO_BYTES) {
        setStatus(`${file.name} is too large`);
        continue;
      }
      try {
        const data = await fileToBase64(file);
        if (data.length <= MAX_PHOTO_BASE64_CHARS) results.push(data);
        else setStatus(`${file.name} is too large`);
      } catch {
        setStatus(`could not read ${file.name}`);
      }
    }
    setPhotos((prev) => [...prev, ...results]);
    e.target.value = "";
  }, [photos.length]);

  const canSubmit = Boolean(profileId) && !submitting && proximity.status === "within";

  const proximityMessage = (() => {
    switch (proximity.status) {
      case "checking":
        return "checking if you're near this bench…";
      case "within":
        return `you're within range (~${formatDistanceMeters(proximity.distance)} away)`;
      case "outside":
        return `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark (you're about ${formatDistanceMeters(proximity.distance)} away)`;
      case "denied":
        return `enable location access — you must be within ${BENCHMARK_GEOFENCE_METERS}m of the bench`;
      case "unavailable":
        return proximity.message;
      default:
        return `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark`;
    }
  })();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileId) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const position = await readCurrentPosition();
      const userPos = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const benchPos = {
        latitude: bench?.latitude ?? pin.latitude,
        longitude: bench?.longitude ?? pin.longitude
      };
      const distance = distanceMeters(userPos, benchPos);
      if (!isWithinGeofence(userPos, benchPos)) {
        setProximity({ status: "outside", distance });
        throw new Error(
          `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark (you're about ${formatDistanceMeters(distance)} away)`
        );
      }
      await submitBenchmark(pin.id, {
        rating: submitRating,
        body,
        photoBase64Items: photos,
        userId: profileId,
        latitude: userPos.latitude,
        longitude: userPos.longitude
      });
      const next = await listBenchReviews(pin.id);
      onReviewsUpdated?.(next);
      setBody("");
      setPhotos([]);
      setSubmitRating(4);
      setMode("overview");
      setHeightVh(EXPANDED_VH);
      trackEvent({ name: "benchmark_submitted", userId: profileId, benchId: pin.id });
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

  const fillPct = ((submitRating - 1) / 4) * 100;
  const headerBack = () => {
    if (mode === "submit") {
      setMode("overview");
      setStatus(null);
      return;
    }
    onClose();
  };

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
        justifyContent: "flex-end",
        pointerEvents: "none"
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
          padding: 0,
          pointerEvents: "auto"
        }}
      />
      <div
        className="surface-card"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          margin: "0 auto",
          height: `${heightVh}vh`,
          maxHeight: `calc(100dvh - var(--safe-top, 0px))`,
          display: "flex",
          flexDirection: "column",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
          pointerEvents: "auto",
          transition: dragging ? "none" : "height 0.22s ease",
          paddingBottom: "calc(var(--nav-height) + var(--safe-bottom))"
        }}
      >
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          style={{
            flexShrink: 0,
            padding: "10px 14px 8px",
            cursor: mode === "submit" ? "default" : "grab",
            touchAction: "none",
            userSelect: "none"
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: "var(--border)",
              margin: "0 auto 10px"
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={headerBack}
              aria-label={mode === "submit" ? "Back to bench overview" : "Back to map"}
              title={mode === "submit" ? "Back to bench" : "Back to map"}
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
                {mode === "submit" ? "submit benchmark" : name}
              </h2>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                {mode === "submit"
                  ? name
                  : `${neighborhood} • ${type}`}
              </p>
            </div>
          </div>
        </div>

        <div
          ref={contentRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "4px 16px 20px"
          }}
        >
          {mode === "overview" ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 14,
                  padding: "12px 14px",
                  borderRadius: "var(--radius)",
                  background: "var(--elevated)",
                  border: "1px solid var(--border)"
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1, color: "var(--accent)" }}>
                    {rating.toFixed(1)}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>avg rating</p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                    {rating.toFixed(1)} ★ · {reviewCount} benchmark{reviewCount === 1 ? "" : "s"}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                    {neighborhood} · {type}
                  </p>
                </div>
              </div>

              {loading && !bench ? (
                <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>loading details…</p>
              ) : null}

              {description ? (
                <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.45 }}>{description}</p>
              ) : !loading ? (
                <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>no description yet</p>
              ) : null}

              {previewPhotos.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>photos</h3>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      overflowX: "auto",
                      paddingBottom: 4,
                      WebkitOverflowScrolling: "touch"
                    }}
                  >
                    {previewPhotos.map((photo, i) => (
                      <button
                        key={`${photo.author}-${i}`}
                        type="button"
                        onClick={() => setSelectedPhoto(photo.src)}
                        style={{
                          border: "none",
                          padding: 0,
                          background: "none",
                          cursor: "pointer",
                          flexShrink: 0,
                          borderRadius: 10,
                          overflow: "hidden",
                          width: 88,
                          height: 88
                        }}
                      >
                        <img
                          src={photo.src}
                          alt={`Bench photo by ${photo.author}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : !loading ? (
                <p className="muted" style={{ margin: "0 0 14px", fontSize: 12 }}>no photos yet</p>
              ) : null}

              <button
                type="button"
                className="button-primary"
                onClick={() => setMode("submit")}
                style={{ width: "100%", marginBottom: 18 }}
              >
                submit a benchmark
              </button>

              <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>
                community benchmarks ({reviewCount}{loading ? "…" : ""})
              </h3>
              {loading && reviews.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>loading reviews…</p>
              ) : reviews.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>no benchmarks yet — be the first!</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {reviews.map((review) => (
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
                      {(review.photoBase64Items ?? []).length > 0 ? (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
                          {(review.photoBase64Items ?? []).slice(0, 3).map((src, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedPhoto(src)}
                              style={{ border: "none", padding: 0, background: "none", cursor: "pointer", flexShrink: 0 }}
                            >
                              <img
                                src={src}
                                alt={`Photo by ${review.author}`}
                                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
                              />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <p className="muted" style={{ margin: "6px 0 0", fontSize: 11 }}>
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <p className="muted" style={{ margin: "0 0 12px", fontSize: 12 }}>
                rate this bench, leave a note, and attach photos of the view.
              </p>

              {profileId ? (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background:
                      proximity.status === "within"
                        ? "var(--accent-soft, rgba(45, 106, 79, 0.12))"
                        : "var(--elevated)",
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: proximity.status === "within" ? "var(--accent)" : "var(--text-secondary)"
                  }}
                >
                  {proximityMessage}
                </div>
              ) : null}

              <div className="rating-slider-container" style={{ marginBottom: 16 }}>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{submitRating.toFixed(1)}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", marginLeft: 8 }}>
                    {RATING_LABELS[String(submitRating)] ?? ""}
                  </span>
                </div>
                <div className="rating-slider-track">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.5}
                    value={submitRating}
                    onChange={(e) => setSubmitRating(parseFloat(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${fillPct}%, var(--border) ${fillPct}%, var(--border) 100%)`
                    }}
                  />
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
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>photos</span>
                  <span className="muted" style={{ fontSize: 12 }}>{photos.length}/{MAX_PHOTOS}</span>
                </div>
                {photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    {photos.map((src, i) => (
                      <div key={i} style={{ position: "relative", width: 64, height: 64 }}>
                        <img
                          src={src}
                          alt={`Upload ${i + 1}`}
                          style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                          style={{
                            position: "absolute", top: -6, right: -6,
                            width: 20, height: 20, borderRadius: "50%",
                            background: "var(--danger)", color: "white",
                            border: "none", cursor: "pointer", fontSize: 12, padding: 0
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
                    add photo
                    <input type="file" accept="image/*" multiple onChange={onPhotosSelected} style={{ display: "none" }} />
                  </label>
                )}
              </div>

              {status && <p style={{ color: "var(--accent)", fontSize: 13, margin: "0 0 10px" }}>{status}</p>}

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
                  href={`/auth/login?next=/explore`}
                  className="button-primary"
                  style={{ width: "100%", display: "block", textAlign: "center", textDecoration: "none" }}
                >
                  sign in to submit a benchmark
                </Link>
              )}
            </form>
          )}
        </div>
      </div>

      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            cursor: "pointer",
            pointerEvents: "auto"
          }}
        >
          <img
            src={selectedPhoto}
            alt="Full view"
            style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: "var(--radius)", objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  );
}
