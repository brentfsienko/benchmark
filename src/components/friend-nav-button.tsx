"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { listFollowRequests } from "@/src/lib/api";

function FriendPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

export function FriendNavButton() {
  const { profileId, user } = useAuth();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!user || !profileId) {
      setPending(0);
      return;
    }
    listFollowRequests(profileId)
      .then((res) => setPending(res.incoming.length))
      .catch(() => setPending(0));
  }, [user, profileId]);

  if (!user) return null;

  return (
    <Link
      href="/friends"
      title="Find friends"
      aria-label={pending > 0 ? `Friends, ${pending} pending requests` : "Find friends"}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--elevated)",
        color: "var(--text-primary)",
        textDecoration: "none"
      }}
    >
      <FriendPlusIcon />
      {pending > 0 ? (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 999,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "grid",
            placeItems: "center",
            lineHeight: 1
          }}
        >
          {pending > 9 ? "9+" : pending}
        </span>
      ) : null}
    </Link>
  );
}
