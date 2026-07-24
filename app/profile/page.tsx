"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import {
  decideFollowRequest,
  getProfile,
  listBenchCards,
  listFollowRequests,
  listFollowers,
  listFollowing,
  removeWishlistItem,
  updateProfile
} from "@/src/lib/api";
import type { BenchCard } from "@/src/lib/api";
import type { UserProfile } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { trackEvent } from "@/src/lib/analytics";

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export default function ProfilePage() {
  const { profileId, user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<{ displayName: string; username: string; bio: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [wishlistBenches, setWishlistBenches] = useState<Record<string, BenchCard>>({});
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profileId) {
      setProfile(null);
      setWishlist([]);
      setWishlistBenches({});
      setFollowers([]);
      setFollowing([]);
      return;
    }
    Promise.all([
      getProfile(profileId),
      listFollowers(profileId),
      listFollowing(profileId),
      listFollowRequests(profileId)
    ])
      .then(([userProfile, fers, fing, req]) => {
        setProfile(userProfile);
        setWishlist(userProfile.wishlistBenchIDs ?? []);
        setFollowers(fers);
        setFollowing(fing);
        setIncomingRequests(req.incoming);
      })
      .catch((err: Error) => setStatus(err.message));
  }, [profileId, user]);

  useEffect(() => {
    if (wishlist.length === 0) {
      setWishlistBenches({});
      return;
    }
    let cancelled = false;
    listBenchCards(wishlist)
      .then((cards) => {
        if (cancelled) return;
        const map: Record<string, BenchCard> = {};
        cards.forEach((b) => { map[b.id] = b; });
        setWishlistBenches(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wishlist]);

  const enterEditMode = () => {
    if (!profile) return;
    setDraft({ displayName: profile.displayName, username: profile.username, bio: profile.bio });
    setStatus(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setStatus(null);
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !profile || !profileId) return;
    setSaving(true);
    try {
      const updated = await updateProfile(profileId, {
        displayName: draft.displayName,
        username: draft.username,
        bio: draft.bio
      });
      setProfile(updated);
      setEditing(false);
      setDraft(null);
      setStatus("profile saved");
      trackEvent({ name: "profile_updated", userId: profileId });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="screen">
      <SectionHeader title="profile" subtitle="your benchmark identity" />

      {!user ? (
        <div className="surface-card" style={{ padding: 20 }}>
          <p className="muted" style={{ margin: "0 0 12px" }}>sign in to save your profile and wishlist</p>
          <Link href="/auth/login" className="button-primary" style={{ display: "inline-block" }}>
            sign in
          </Link>
        </div>
      ) : null}

      {user && profile ? (
        editing && draft ? (
          <form onSubmit={onSave} className="surface-card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>editing profile</span>
              <button type="button" onClick={cancelEdit} className="button-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>
                cancel
              </button>
            </div>
            <label>
              display name
              <input
                value={draft.displayName}
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block", marginTop: 10 }}>
              username
              <input
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                placeholder="@username"
                style={{ width: "100%", marginTop: 4 }}
              />
              <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 4 }}>lowercase, no spaces</span>
            </label>
            <label style={{ display: "block", marginTop: 10 }}>
              bio
              <textarea
                value={draft.bio}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                rows={3}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <button className="button-primary" style={{ marginTop: 12, width: "100%" }} type="submit" disabled={saving}>
              {saving ? "saving…" : "save changes"}
            </button>
          </form>
        ) : (
          <div className="surface-card" style={{ padding: 16, marginBottom: 12, position: "relative" }}>
            <button
              type="button"
              onClick={enterEditMode}
              title="Edit profile"
              style={{
                position: "absolute", top: 14, right: 14,
                background: "var(--surface-secondary)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "6px 8px", cursor: "pointer",
                color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4,
                fontSize: 12, fontWeight: 500, transition: "all 0.15s ease"
              }}
            >
              <PencilIcon /> edit
            </button>

            <div style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{profile.displayName}</h2>
              <span className="muted" style={{ fontSize: 13 }}>@{profile.username}</span>
            </div>

            {profile.bio ? (
              <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                {profile.bio}
              </p>
            ) : (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13, fontStyle: "italic" }}>
                no bio yet — tap edit to add one
              </p>
            )}

            <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 13 }}>
                <strong style={{ color: "var(--text-primary)" }}>{profile.benchmarkCount ?? profile.benchmarkedBenchIDs.length}</strong> benchmark
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                <strong style={{ color: "var(--text-primary)" }}>{followers.length}</strong> followers
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                <strong style={{ color: "var(--text-primary)" }}>{following.length}</strong> following
              </span>
            </div>
          </div>
        )
      ) : user && profileId ? (
        <p className="muted">loading profile…</p>
      ) : null}

      {user && status && (
        <p style={{ color: "var(--accent)", fontSize: 13, margin: "0 0 12px", fontWeight: 500 }}>{status}</p>
      )}

      {user && incomingRequests.length > 0 && (
        <section className="surface-card" style={{ padding: 14, marginBottom: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>
            follow requests
            <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
              ({incomingRequests.length})
            </span>
          </h2>
          <div style={{ display: "grid", gap: 8 }}>
            {incomingRequests.map((requesterId) => (
              <div
                key={requesterId}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}
              >
                <Link href={`/user/${requesterId}`} style={{ fontSize: 13, fontWeight: 600 }}>
                  {requesterId}
                </Link>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="button-secondary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={async () => {
                      if (!profileId) return;
                      try {
                        await decideFollowRequest(profileId, requesterId, "reject");
                        setIncomingRequests((prev) => prev.filter((id) => id !== requesterId));
                        setStatus("request declined");
                      } catch (err) {
                        setStatus(err instanceof Error ? err.message : "unable to decline request");
                      }
                    }}
                  >
                    decline
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={async () => {
                      if (!profileId) return;
                      try {
                        await decideFollowRequest(profileId, requesterId, "approve");
                        setIncomingRequests((prev) => prev.filter((id) => id !== requesterId));
                        setFollowers((prev) => (prev.includes(requesterId) ? prev : [...prev, requesterId]));
                        setStatus("request approved");
                      } catch (err) {
                        setStatus(err instanceof Error ? err.message : "unable to approve request");
                      }
                    }}
                  >
                    approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {user && (
        <section className="surface-card" style={{ padding: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>
            wishlist
            {wishlist.length > 0 && (
              <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
                ({wishlist.length})
              </span>
            )}
          </h2>
          {wishlist.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              no benches saved yet — find one you love on the{" "}
              <Link href="/explore" style={{ color: "var(--accent)", fontWeight: 600 }}>map</Link>
            </p>
          ) : null}
          <div style={{ display: "grid", gap: 8 }}>
            {wishlist.map((benchID) => {
              const b = wishlistBenches[benchID];
              return (
                <div
                  key={benchID}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: "var(--radius)",
                    background: "var(--elevated)", border: "1px solid var(--border)"
                  }}
                >
                  <Link
                    href={`/bench/${benchID}`}
                    style={{ flex: 1, minWidth: 0, textDecoration: "none" }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b ? b.name : benchID}
                    </p>
                    {b && (
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                        {b.neighborhood} • {b.averageRating.toFixed(1)} ★
                      </p>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (profileId) {
                        removeWishlistItem(profileId, benchID)
                          .then(() => setWishlist((prev) => prev.filter((item) => item !== benchID)))
                          .catch((err: Error) => setStatus(err.message));
                      }
                    }}
                    style={{
                      flexShrink: 0, background: "none", border: "none",
                      cursor: "pointer", color: "var(--text-secondary)", padding: 4
                    }}
                    title="Remove from wishlist"
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {user && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="button-secondary" style={{ width: "100%", opacity: 0.7 }} onClick={() => signOut()}>
            sign out
          </button>
        </div>
      )}
    </section>
  );
}
