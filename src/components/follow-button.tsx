"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { decideFollowRequest, followUser, listFollowRequests, listFollowing, unfollowUser } from "@/src/lib/api";
import type { FollowRelationshipState } from "@/src/lib/types";

type FollowButtonProps = {
  targetUserId: string;
  size?: "sm" | "md";
};

export function FollowButton({ targetUserId, size = "md" }: FollowButtonProps) {
  const { profileId, user } = useAuth();
  const [state, setState] = useState<FollowRelationshipState>("none");
  const [loading, setLoading] = useState(true);

  const isSelf = profileId === targetUserId;

  useEffect(() => {
    if (!profileId || isSelf) {
      setLoading(false);
      return;
    }
    Promise.all([listFollowing(profileId), listFollowRequests(profileId)])
      .then(([followingIds, req]) => {
        if (followingIds.includes(targetUserId)) {
          setState("following");
          return;
        }
        if (req.outgoing.includes(targetUserId)) {
          setState("requested");
          return;
        }
        setState("none");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId, targetUserId, isSelf]);

  const toggle = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      if (state === "following" || state === "requested") {
        if (state === "requested") {
          await decideFollowRequest(profileId, targetUserId, "cancel");
        }
        await unfollowUser(profileId, targetUserId);
        setState("none");
      } else {
        const res = await followUser(profileId, targetUserId);
        setState(res.state);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [profileId, targetUserId, state]);

  if (isSelf || !user) return null;
  if (loading) return <span className="muted" style={{ fontSize: size === "sm" ? 11 : 13 }}>…</span>;

  const btnStyle: React.CSSProperties =
    size === "sm"
      ? { fontSize: 11, padding: "3px 8px", height: 24, lineHeight: "18px" }
      : {};

  return (
    <button
      type="button"
      className={state === "none" ? "button-primary" : "button-secondary"}
      style={btnStyle}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle();
      }}
    >
      {state === "following" ? "following" : state === "requested" ? "requested" : "follow"}
    </button>
  );
}
