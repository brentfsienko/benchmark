"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { followUser, listFollowing, unfollowUser } from "@/src/lib/api";

type FollowButtonProps = {
  targetUserId: string;
  size?: "sm" | "md";
};

export function FollowButton({ targetUserId, size = "md" }: FollowButtonProps) {
  const { profileId, user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const isSelf = profileId === targetUserId;

  useEffect(() => {
    if (!profileId || isSelf) {
      setLoading(false);
      return;
    }
    listFollowing(profileId)
      .then((ids) => setIsFollowing(ids.includes(targetUserId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId, targetUserId, isSelf]);

  const toggle = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(profileId, targetUserId);
        setIsFollowing(false);
      } else {
        await followUser(profileId, targetUserId);
        setIsFollowing(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [profileId, targetUserId, isFollowing]);

  if (isSelf || !user) return null;
  if (loading) return <span className="muted" style={{ fontSize: size === "sm" ? 11 : 13 }}>…</span>;

  const btnStyle: React.CSSProperties =
    size === "sm"
      ? { fontSize: 11, padding: "3px 8px", height: 24, lineHeight: "18px" }
      : {};

  return (
    <button
      type="button"
      className={isFollowing ? "button-secondary" : "button-primary"}
      style={btnStyle}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle();
      }}
    >
      {isFollowing ? "following" : "follow"}
    </button>
  );
}
