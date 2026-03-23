import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { LeaderboardEntry } from "@/src/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ parkId: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { parkId } = await params;
    const supabase = createSupabaseServer();

    const { data: challenges } = await supabase
      .from("challenges")
      .select("id")
      .eq("park_id", parkId)
      .eq("is_active", true);

    const challengeIds = (challenges ?? []).map((c: { id: string }) => c.id);
    if (challengeIds.length === 0) {
      return jsonCachedData([], 30, 120);
    }

    const { data: allParticipants } = await supabase
      .from("challenge_participants")
      .select("user_id, points, progress_count")
      .in("challenge_id", challengeIds)
      .order("points", { ascending: false });

    const byUser = (allParticipants ?? []).reduce(
      (acc: Record<string, { points: number; progress: number }>, p: { user_id: string; points: number; progress_count: number }) => {
        const key = p.user_id;
        if (!acc[key]) acc[key] = { points: 0, progress: 0 };
        acc[key].points += p.points;
        acc[key].progress += p.progress_count;
        return acc;
      },
      {}
    );

    const sorted = Object.entries(byUser)
      .map(([userId, { points, progress }]) => ({ userId, points, progress }))
      .sort((a, b) => b.points - a.points);

    const userIds = sorted.map((s) => s.userId);
    let userMap: Record<string, { displayName: string; username: string }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, display_name, username").in("id", userIds);
      userMap = (users ?? []).reduce(
        (acc: Record<string, { displayName: string; username: string }>, u: { id: string; display_name: string; username: string }) => {
          acc[u.id] = { displayName: u.display_name, username: u.username };
          return acc;
        },
        {}
      );
    }

    const entries: LeaderboardEntry[] = sorted.map((s, i) => ({
      userId: s.userId,
      displayName: userMap[s.userId]?.displayName ?? undefined,
      username: userMap[s.userId]?.username ?? undefined,
      points: s.points,
      progress: s.progress,
      rank: i + 1
    }));
    return jsonCachedData(entries, 30, 120);
  } catch (err) {
    return jsonError("Unable to load leaderboard", "internal_error", 500);
  }
}
