"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  addReviewComment,
  likeBenchmark,
  listReviewComments,
  unlikeBenchmark,
  updateBenchmark
} from "@/src/lib/api";
import type { ActivityItem, ReviewComment } from "@/src/lib/types";
import { MiniBenchMap } from "@/src/components/mini-bench-map";
import { MapLightbox } from "@/src/components/map-lightbox";
import { PhotoLightbox } from "@/src/components/photo-lightbox";

function photoSrc(raw: string): string {
  if (raw.startsWith("data:") || raw.startsWith("http")) return raw;
  return `data:image/jpeg;base64,${raw}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

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

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        border: "1.5px solid var(--accent)",
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        color: "var(--accent)",
        fontSize: 15
      }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

type FeedPostCardProps = {
  item: ActivityItem;
  viewerId: string | null;
  onUpdated: (next: ActivityItem) => void;
};

export function FeedPostCard({ item, viewerId, onUpdated }: FeedPostCardProps) {
  const [liked, setLiked] = useState(Boolean(item.likedByMe));
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState(item.commentCount ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editRating, setEditRating] = useState(item.rating ?? 4);
  const [editBody, setEditBody] = useState(item.body ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const isOwner = Boolean(viewerId && viewerId === item.userId);
  const authorName = item.author || item.username || "benchmarker";
  const location = item.neighborhood || undefined;

  const slides = useMemo(() => {
    const out: Array<{ type: "map" } | { type: "photo"; src: string }> = [];
    if (
      item.latitude != null &&
      item.longitude != null &&
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude)
    ) {
      out.push({ type: "map" });
    }
    for (const p of item.photoBase64Items ?? []) {
      out.push({ type: "photo", src: photoSrc(p) });
    }
    return out;
  }, [item.latitude, item.longitude, item.photoBase64Items]);

  const photoSlides = useMemo(
    () => slides.filter((s): s is { type: "photo"; src: string } => s.type === "photo").map((s) => s.src),
    [slides]
  );

  const multiSlide = slides.length > 1;
  // Nearly full-bleed slides; leave ~12% so the next photo peeks in.
  const slideWidth = multiSlide ? "88%" : "100%";
  const slideRadius = multiSlide ? 12 : 0;

  const likeInFlightRef = useRef(false);

  const toggleLike = async () => {
    if (!viewerId || likeInFlightRef.current) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));
    likeInFlightRef.current = true;
    setLiked(nextLiked);
    setLikeCount(nextCount);
    onUpdated({ ...item, likedByMe: nextLiked, likeCount: nextCount });
    try {
      const res = nextLiked ? await likeBenchmark(item.id) : await unlikeBenchmark(item.id);
      setLiked(res.liked);
      if (typeof res.likeCount === "number") {
        setLikeCount(res.likeCount);
        onUpdated({ ...item, likedByMe: res.liked, likeCount: res.likeCount });
      }
    } catch (err) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      onUpdated({ ...item, likedByMe: prevLiked, likeCount: prevCount });
      setStatus(err instanceof Error ? err.message : "unable to update like");
    } finally {
      likeInFlightRef.current = false;
    }
  };

  const openComments = async () => {
    setCommentsOpen(true);
    try {
      const rows = await listReviewComments(item.id);
      setComments(rows);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to load comments");
    }
  };

  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewerId || !commentDraft.trim() || busy) return;
    setBusy(true);
    try {
      const created = await addReviewComment(item.id, commentDraft.trim());
      setComments((prev) => [...prev, created]);
      setCommentDraft("");
      const nextCount = commentCount + 1;
      setCommentCount(nextCount);
      onUpdated({ ...item, commentCount: nextCount });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to comment");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/bench/${item.benchId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.benchName, text: `Check out this bench on Benchmark`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("link copied");
        setTimeout(() => setStatus(null), 2000);
      }
    } catch {
      // user cancelled share
    }
  };

  const saveEdit = async () => {
    if (!isOwner || busy) return;
    setBusy(true);
    try {
      const updated = await updateBenchmark(item.id, {
        rating: editRating,
        body: editBody
      });
      onUpdated({
        ...item,
        rating: updated.rating,
        body: updated.body
      });
      setEditing(false);
      setMenuOpen(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="feed-post" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 14px 10px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Link href={`/user/${item.userId}`} style={{ flexShrink: 0 }}>
          <Avatar name={authorName} url={item.avatarPhotoURL} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/user/${item.userId}`} style={{ fontWeight: 700, fontSize: 14, textDecoration: "none", color: "var(--text-primary)" }}>
            {authorName}
          </Link>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
            🪑 {formatWhen(item.createdAt)}
            {location ? ` · ${location}` : ""}
          </p>
        </div>
        {isOwner ? (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Post options"
              onClick={() => setMenuOpen((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 18, lineHeight: 1, padding: 4 }}
            >
              ···
            </button>
            {menuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 28,
                  background: "var(--elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  minWidth: 120,
                  zIndex: 5,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)"
                }}
              >
                <button
                  type="button"
                  className="button-secondary"
                  style={{ width: "100%", border: "none", borderRadius: 10, textAlign: "left" }}
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                >
                  edit
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ padding: "0 14px 10px" }}>
        <Link href={`/bench/${item.benchId}`} style={{ textDecoration: "none", color: "inherit" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{item.benchName}</h2>
        </Link>
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>Rating</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              {item.rating != null ? <StarRating rating={item.rating} /> : "—"}
            </p>
          </div>
          {(item.photoBase64Items?.length ?? 0) > 0 ? (
            <div>
              <p className="muted" style={{ margin: 0, fontSize: 11 }}>Photos</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{item.photoBase64Items?.length}</p>
            </div>
          ) : null}
        </div>
        {editing ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12 }}>
              rating
              <input
                type="number"
                min={0}
                max={5}
                step={0.5}
                value={editRating}
                onChange={(e) => setEditRating(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              note
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
                cancel
              </button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void saveEdit()}>
                {busy ? "saving…" : "save"}
              </button>
            </div>
          </div>
        ) : item.body ? (
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.45, color: "var(--text-secondary)" }}>
            {item.body}
          </p>
        ) : null}
      </div>

      {slides.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            padding: multiSlide ? "0 0 0 12px" : 0,
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
          className="feed-media-carousel"
        >
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={s.type === "map" ? "Expand map" : "View photo"}
              onClick={() => {
                if (s.type === "map") setMapOpen(true);
                else setLightboxSrc(s.src);
              }}
              style={{
                flex: `0 0 ${slideWidth}`,
                aspectRatio: "1 / 1",
                borderRadius: slideRadius,
                overflow: "hidden",
                isolation: "isolate",
                scrollSnapAlign: "start",
                background: "var(--elevated)",
                position: "relative",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "block"
              }}
            >
              {s.type === "map" && item.latitude != null && item.longitude != null ? (
                <MiniBenchMap
                  latitude={item.latitude}
                  longitude={item.longitude}
                  markerLabel={item.benchName}
                  interactive={false}
                />
              ) : null}
              {s.type === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
              ) : null}
            </button>
          ))}
          {multiSlide ? <div style={{ flex: "0 0 12px" }} aria-hidden /> : null}
        </div>
      ) : null}

      {item.latitude != null && item.longitude != null ? (
        <MapLightbox
          open={mapOpen}
          latitude={item.latitude}
          longitude={item.longitude}
          label={item.benchName}
          onClose={() => setMapOpen(false)}
        />
      ) : null}

      <PhotoLightbox
        photos={photoSlides}
        src={lightboxSrc}
        onClose={() => setLightboxSrc(null)}
        onChange={setLightboxSrc}
        alt={`Photo of ${item.benchName}`}
      />

      <div style={{ padding: "10px 14px 6px", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {likeCount} {likeCount === 1 ? "like" : "likes"}
          {commentCount > 0 ? ` · ${commentCount} ${commentCount === 1 ? "comment" : "comments"}` : ""}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          padding: "4px 14px 12px",
          borderTop: commentsOpen ? "1px solid var(--border)" : "none"
        }}
      >
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={!viewerId}
          style={{
            ...actionBtnStyle,
            color: liked ? "var(--accent)" : "var(--text-secondary)",
            fontWeight: liked ? 600 : 500
          }}
        >
          {liked ? "liked" : "like"}
        </button>
        <button type="button" onClick={() => void openComments()} disabled={!viewerId} style={actionBtnStyle}>
          comment
        </button>
        <button type="button" onClick={() => void share()} style={actionBtnStyle}>
          share
        </button>
      </div>

      {commentsOpen ? (
        <div style={{ padding: "0 14px 14px", display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13 }}>
                  <strong>{c.author}</strong>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>{c.body}</span>
                </p>
              </div>
            </div>
          ))}
          {viewerId ? (
            <form onSubmit={submitComment} style={{ display: "flex", gap: 8 }}>
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment…"
                style={{ flex: 1 }}
              />
              <button type="submit" className="button-primary" disabled={busy || !commentDraft.trim()}>
                post
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="muted" style={{ margin: 0, padding: "0 14px 12px", fontSize: 12 }}>
          {status}
        </p>
      ) : null}
    </article>
  );
}

const actionBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)"
};
