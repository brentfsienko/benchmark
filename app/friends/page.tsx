"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import {
  decideFollowRequest,
  listFollowRequests,
  listFriends,
  searchUsers,
  unfollowUser
} from "@/src/lib/api";
import type { FollowRequests, UserSearchResult, UserSummary } from "@/src/lib/types";
import { SectionHeader } from "@/src/components/section-header";
import { FollowButton } from "@/src/components/follow-button";
import { trackEvent } from "@/src/lib/analytics";

type Tab = "friends" | "requests" | "search";

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid var(--border)"
        }}
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
        fontSize: 15,
        fontWeight: 700,
        color: "var(--accent)",
        flexShrink: 0
      }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function UserRow({
  user,
  trailing
}: {
  user: UserSummary;
  trailing: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)"
      }}
    >
      <Link href={`/user/${user.id}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none" }}>
        <Avatar name={user.displayName || user.username} url={user.avatarPhotoURL} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.displayName || user.username}
          </p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
            @{user.username}
          </p>
        </div>
      </Link>
      <div style={{ flexShrink: 0 }}>{trailing}</div>
    </div>
  );
}

export default function FriendsPage() {
  const { profileId, user } = useAuth();
  const [tab, setTab] = useState<Tab>("search");
  const [friends, setFriends] = useState<UserSummary[]>([]);
  const [requests, setRequests] = useState<FollowRequests>({ incoming: [], outgoing: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    if (!profileId) return;
    const [f, r] = await Promise.all([listFriends(profileId), listFollowRequests(profileId)]);
    setFriends(f);
    setRequests(r);
  }, [profileId]);

  useEffect(() => {
    if (!user || !profileId) {
      setFriends([]);
      setRequests({ incoming: [], outgoing: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshLists()
      .then(() => trackEvent({ name: "friends_page_loaded", userId: profileId }))
      .catch((err: Error) => setStatus(err.message))
      .finally(() => setLoading(false));
  }, [user, profileId, refreshLists]);

  useEffect(() => {
    if (!user || !profileId) {
      setResults([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      searchUsers(q)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((err: Error) => {
          if (!cancelled) setStatus(err.message);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, user, profileId]);

  const pendingCount = requests.incoming.length;

  return (
    <section className="screen">
      <SectionHeader title="friends" subtitle="find people and manage requests" />

      {!user ? (
        <div className="surface-card" style={{ padding: 20 }}>
          <p className="muted" style={{ margin: "0 0 12px" }}>sign in to find friends</p>
          <Link href="/auth/login" className="button-primary">
            sign in
          </Link>
        </div>
      ) : null}

      {user && (
        <>
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: 4,
              borderRadius: 12,
              background: "var(--surface-secondary)",
              border: "1px solid var(--border)"
            }}
          >
            {(
              [
                { id: "search", label: "search" },
                { id: "friends", label: `friends${friends.length ? ` (${friends.length})` : ""}` },
                {
                  id: "requests",
                  label: `requests${pendingCount ? ` (${pendingCount})` : ""}`
                }
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: 9,
                  padding: "8px 6px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: tab === t.id ? "var(--elevated)" : "transparent",
                  color: tab === t.id ? "var(--accent)" : "var(--text-secondary)",
                  boxShadow: tab === t.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {status ? (
            <p style={{ color: "var(--accent)", fontSize: 13, margin: 0, fontWeight: 500 }}>{status}</p>
          ) : null}

          {tab === "search" && (
            <div>
              <div style={{ position: "relative" }}>
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-secondary)",
                    display: "flex"
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search by username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    width: "100%",
                    padding: "12px 12px 12px 36px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--elevated)",
                    color: "var(--text-primary)",
                    fontSize: 15
                  }}
                />
              </div>
              {query.trim().length > 0 && query.trim().length < 2 ? (
                <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>type at least 2 characters</p>
              ) : null}
              {searching ? <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>searching…</p> : null}
              {!searching && query.trim().length >= 2 && results.length === 0 ? (
                <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>no users found</p>
              ) : null}
              <div style={{ marginTop: 4 }}>
                {results.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    trailing={<FollowButton targetUserId={u.id} size="sm" variant="friend" />}
                  />
                ))}
              </div>
            </div>
          )}

          {tab === "friends" && (
            <div>
              {loading ? <p className="muted">loading…</p> : null}
              {!loading && friends.length === 0 ? (
                <div className="surface-card" style={{ padding: 20, textAlign: "center" }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 600 }}>no friends yet</p>
                  <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
                    search for people by username and send a friend request
                  </p>
                  <button type="button" className="button-primary" onClick={() => setTab("search")}>
                    find friends
                  </button>
                </div>
              ) : null}
              {friends.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  trailing={
                    <button
                      type="button"
                      className="button-secondary"
                      style={{ fontSize: 12, padding: "5px 10px" }}
                      onClick={async () => {
                        if (!profileId) return;
                        try {
                          await unfollowUser(profileId, u.id);
                          setFriends((prev) => prev.filter((f) => f.id !== u.id));
                          setStatus(`removed @${u.username}`);
                          setTimeout(() => setStatus(null), 2500);
                        } catch (err) {
                          setStatus(err instanceof Error ? err.message : "unable to remove friend");
                        }
                      }}
                    >
                      remove
                    </button>
                  }
                />
              ))}
            </div>
          )}

          {tab === "requests" && (
            <div style={{ display: "grid", gap: 16 }}>
              <section>
                <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
                  incoming
                  {pendingCount > 0 ? (
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                      ({pendingCount})
                    </span>
                  ) : null}
                </h2>
                {requests.incoming.length === 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>no pending requests</p>
                ) : (
                  requests.incoming.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      trailing={
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="button-secondary"
                            style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={async () => {
                              if (!profileId) return;
                              try {
                                await decideFollowRequest(profileId, u.id, "reject");
                                setRequests((prev) => ({
                                  ...prev,
                                  incoming: prev.incoming.filter((x) => x.id !== u.id)
                                }));
                              } catch (err) {
                                setStatus(err instanceof Error ? err.message : "unable to decline");
                              }
                            }}
                          >
                            decline
                          </button>
                          <button
                            type="button"
                            className="button-primary"
                            style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={async () => {
                              if (!profileId) return;
                              try {
                                await decideFollowRequest(profileId, u.id, "approve");
                                setRequests((prev) => ({
                                  ...prev,
                                  incoming: prev.incoming.filter((x) => x.id !== u.id)
                                }));
                                await refreshLists();
                                setStatus(`you and @${u.username} are now friends`);
                                setTimeout(() => setStatus(null), 2500);
                              } catch (err) {
                                setStatus(err instanceof Error ? err.message : "unable to approve");
                              }
                            }}
                          >
                            accept
                          </button>
                        </div>
                      }
                    />
                  ))
                )}
              </section>

              <section>
                <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
                  sent
                  {requests.outgoing.length > 0 ? (
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                      ({requests.outgoing.length})
                    </span>
                  ) : null}
                </h2>
                {requests.outgoing.length === 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>no sent requests</p>
                ) : (
                  requests.outgoing.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      trailing={
                        <button
                          type="button"
                          className="button-secondary"
                          style={{ fontSize: 12, padding: "5px 10px" }}
                          onClick={async () => {
                            if (!profileId) return;
                            try {
                              await decideFollowRequest(profileId, u.id, "cancel");
                              setRequests((prev) => ({
                                ...prev,
                                outgoing: prev.outgoing.filter((x) => x.id !== u.id)
                              }));
                            } catch (err) {
                              setStatus(err instanceof Error ? err.message : "unable to cancel");
                            }
                          }}
                        >
                          cancel
                        </button>
                      }
                    />
                  ))
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
