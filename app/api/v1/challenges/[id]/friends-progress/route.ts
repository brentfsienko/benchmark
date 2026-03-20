import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";
import type { FriendChallengeProgress } from "@/src/lib/types";

const GREEN_LAKE_COMPLETION_TARGET = 8;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);

  const { id } = await params;
  const supabase = createSupabaseServer();

  const [followingRes, followersRes] = await Promise.all([
    supabase.from("user_follows").select("following_id").eq("follower_id", actor.profileId),
    supabase.from("user_follows").select("follower_id").eq("following_id", actor.profileId)
  ]);
  if (followingRes.error || followersRes.error) {
    return jsonError("Unable to load friend graph", "internal_error", 500);
  }

  const following = new Set((followingRes.data ?? []).map((r: { following_id: string }) => r.following_id));
  const followers = new Set((followersRes.data ?? []).map((r: { follower_id: string }) => r.follower_id));
  const friendIds = [...following].filter((uid) => followers.has(uid));
  if (friendIds.length === 0) return jsonData<FriendChallengeProgress[]>([]);

  const [participantsRes, usersRes] = await Promise.all([
    supabase
      .from("challenge_participants")
      .select("user_id, points, progress_count")
      .eq("challenge_id", id)
      .in("user_id", friendIds),
    supabase.from("users").select("id, display_name, username").in("id", friendIds)
  ]);
  if (participantsRes.error || usersRes.error) {
    return jsonError("Unable to load friend challenge progress", "internal_error", 500);
  }

  const userMap = (usersRes.data ?? []).reduce(
    (acc: Record<string, { displayName: string; username: string }>, u: { id: string; display_name: string; username: string }) => {
      acc[u.id] = { displayName: u.display_name, username: u.username };
      return acc;
    },
    {}
  );

  const rows: FriendChallengeProgress[] = (participantsRes.data ?? []).map((p: { user_id: string; points: number; progress_count: number }) => {
    const progress = Number(p.progress_count ?? 0);
    return {
      userId: p.user_id,
      displayName: userMap[p.user_id]?.displayName ?? "friend",
      username: userMap[p.user_id]?.username ?? "",
      points: Number(p.points ?? 0),
      progress,
      started: progress > 0 || Number(p.points ?? 0) > 0,
      completed: progress >= GREEN_LAKE_COMPLETION_TARGET
    };
  });

  rows.sort((a, b) => {
    if (b.completed !== a.completed) return Number(b.completed) - Number(a.completed);
    return b.points - a.points;
  });
  return jsonData(rows);
}
