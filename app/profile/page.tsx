"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { getProfile, listFollowers, listFollowing, listWishlist, removeWishlistItem, updateProfile } from "@/src/lib/api";
import type { UserProfile } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { trackEvent } from "@/src/lib/analytics";

export default function ProfilePage() {
  const { profileId, user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    Promise.all([getProfile(profileId), listWishlist(profileId), listFollowers(profileId), listFollowing(profileId)])
      .then(([user, items, fers, fing]) => {
        setProfile(user);
        setWishlist(items);
        setFollowers(fers);
        setFollowing(fing);
      })
      .catch((err: Error) => setStatus(err.message));
  }, [profileId]);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || !profileId) return;
    try {
      const updated = await updateProfile(profileId, {
        displayName: profile.displayName,
        username: profile.username,
        bio: profile.bio
      });
      setProfile(updated);
      setStatus("profile updated");
      trackEvent({ name: "profile_updated", userId: profileId });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to update profile");
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
      ) : (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="button-secondary" onClick={() => signOut()}>
            sign out
          </button>
        </div>
      )}
      {profile ? (
        <form onSubmit={onSave} className="surface-card" style={{ padding: 14, marginBottom: 12 }}>
          <label>
            display name
            <input
              value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            username
            <input
              value={profile.username}
              onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
              placeholder="@username"
              style={{ width: "100%", marginTop: 4 }}
            />
            <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 4 }}>lowercase, no spaces</span>
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            bio
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              rows={3}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <button className="button-primary" style={{ marginTop: 10 }} type="submit">
            save profile
          </button>
        </form>
      ) : profileId ? (
        <p className="muted">loading profile…</p>
      ) : null}

      {profile && profileId && (
        <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
          <span className="muted"><strong style={{ color: "var(--text-primary)" }}>{profile.benchmarkedBenchIDs.length}</strong> benchmarked</span>
          <span className="muted"><strong style={{ color: "var(--text-primary)" }}>{followers.length}</strong> followers</span>
          <span className="muted"><strong style={{ color: "var(--text-primary)" }}>{following.length}</strong> following</span>
        </div>
      )}

      <section className="surface-card" style={{ padding: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>wishlist</h2>
        {wishlist.length === 0 ? <p className="muted">no benches saved yet</p> : null}
        <div style={{ display: "grid", gap: 8 }}>
          {wishlist.map((benchID) => (
            <div key={benchID} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{benchID}</span>
              <button
                className="button-secondary"
                onClick={() => {
                  if (profileId) {
                    removeWishlistItem(profileId, benchID)
                      .then(() => setWishlist((prev) => prev.filter((item) => item !== benchID)))
                      .catch((err: Error) => setStatus(err.message));
                  }
                }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      </section>
      {status ? <p style={{ color: "var(--accent)" }}>{status}</p> : null}
    </section>
  );
}
