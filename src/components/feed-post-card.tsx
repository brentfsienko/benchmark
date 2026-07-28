"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, type CSSProperties } from "react";
import {
  addReviewComment,
  likeBenchmark,
  listReviewComments,
  unlikeBenchmark,
  updateBenchmark
} from "@/src/lib/api";
import type { ActivityItem, ReviewComment } from "@/src/lib/types";
import { MiniBenchMap } from "@/src/components/mini-bench-map";

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
        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        border: "1.5px solid var(--accent)",
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        color: "var(--accent)",
        fontSize: 13
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

  const multiSlide = slides.length > 1;
  // Leave a peek of the next card (~12%) when there are multiple slides.
  const slideWidth = multiSlide ? "88%" : "100%";
  const slideHeight = multiSlide ? 168 : 180;

  const toggleLike = async () => {
    if (!viewerId || busy) return;
    setBusy(true);
    try {
      const res = liked ? await unlikeBenchmark(item.id) : await likeBenchmark(item.id);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
      onUpdated({ ...item, likedByMe: res.liked, likeCount: res.likeCount });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to update like");
    } finally {
      setBusy(false);
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
    <article className="surface-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 12px 6px", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Link href={`/user/${item.userId}`} style={{ flexShrink: 0 }}>
          <Avatar name={authorName} url={item.avatarPhotoURL} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/user/${item.userId}`} style={{ fontWeight: 700, fontSize: 13, textDecoration: "none", color: "var(--text-primary)" }}>
            {authorName}
          </Link>
          <p className="muted" style={{ margin: "1px 0 0", fontSize: 11 }}>
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
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 16, lineHeight: 1, padding: 2 }}
            >
              ···
            </button>
            {menuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 24,
                  background: "var(--elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  minWidth: 110,
                  zIndex: 5,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)"
                }}
              >
                <button
                  type="button"
                  className="button-secondary"
                  style={{ width: "100%", border: "none", borderRadius: 10, textAlign: "left", fontSize: 12 }}
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

      <div style={{ padding: "0 12px 8px" }}>
        <Link href={`/bench/${item.benchId}`} style={{ textDecoration: "none", color: "inherit" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{item.benchName}</h2>
        </Link>
        <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 10 }}>Rating</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
              {item.rating != null ? <StarRating rating={item.rating} /> : "—"}
            </p>
          </div>
          {(item.photoBase64Items?.length ?? 0) > 0 ? (
            <div>
              <p className="muted" style={{ margin: 0, fontSize: 10 }}>Photos</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{item.photoBase64Items?.length}</p>
            </div>
          ) : null}
        </div>
        {editing ? (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
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
                rows={2}
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
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.4, color: "var(--text-secondary)" }}>
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
            padding: multiSlide ? "0 12px 0 12px" : 0,
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
          className="feed-media-carousel"
        >
          {slides.map((s, i) => (
            <div
              key={i}
              style={{
                flex: `0 0 ${slideWidth}`,
                height: slideHeight,
                borderRadius: multiSlide ? 10 : 0,
                overflow: "hidden",
                scrollSnapAlign: "start",
                background: "var(--elevated)",
                position: "relative"
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
                <img src={s.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : null}
            </div>
          ))}
          {/* Trailing spacer so the last slide can still show a peek feel when scrolling back */}
          {multiSlide ? <div style={{ flex: "0 0 4px" }} aria-hidden /> : null}
        </div>
      ) : null}

      <div style={{ padding: "8px 12px 4px", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          {likeCount} {likeCount === 1 ? "like" : "likes"}
        </p>
        <button
          type="button"
          onClick={() => void openComments()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 11, padding: 0 }}
        >
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderTop: "1px solid var(--border)",
          borderBottom: commentsOpen ? "1px solid var(--border)" : "none"
        }}
      >
        <button type="button" onClick={() => void toggleLike()} disabled={!viewerId || busy} style={actionBtnStyle}>
          {liked ? "♥ liked" : "♡ like"}
        </button>
        <button type="button" onClick={() => void openComments()} disabled={!viewerId} style={actionBtnStyle}>
          💬 comment
        </button>
        <button type="button" onClick={() => void share()} style={{ ...actionBtnStyle, borderRight: "none" }}>
          ↗ share
        </button>
      </div>

      {commentsOpen ? (
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12 }}>
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
                style={{ flex: 1, fontSize: 13 }}
              />
              <button type="submit" className="button-primary" disabled={busy || !commentDraft.trim()}>
                post
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="muted" style={{ margin: 0, padding: "0 12px 10px", fontSize: 11 }}>
          {status}
        </p>
      ) : null}
    </article>
  );
}

const actionBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  borderRight: "1px solid var(--border)",
  padding: "8px 4px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)"
};
