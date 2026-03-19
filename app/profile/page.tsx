"use client";

import { FormEvent, useEffect, useState } from "react";
import { env } from "@/src/lib/env";
import { getProfile, listWishlist, removeWishlistItem, updateProfile } from "@/src/lib/api";
import type { UserProfile } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { trackEvent } from "@/src/lib/analytics";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getProfile(env.currentUserID), listWishlist(env.currentUserID)])
      .then(([user, items]) => {
        setProfile(user);
        setWishlist(items);
      })
      .catch((err: Error) => setStatus(err.message));
  }, []);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    try {
      const updated = await updateProfile(env.currentUserID, {
        displayName: profile.displayName,
        bio: profile.bio
      });
      setProfile(updated);
      setStatus("profile updated");
      trackEvent({ name: "profile_updated", userId: env.currentUserID });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to update profile");
    }
  };

  return (
    <section className="screen">
      <SectionHeader title="profile" subtitle="your benchmark identity" />
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
      ) : (
        <p className="muted">loading profile…</p>
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
                  removeWishlistItem(env.currentUserID, benchID)
                    .then(() => setWishlist((prev) => prev.filter((item) => item !== benchID)))
                    .catch((err: Error) => setStatus(err.message));
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
