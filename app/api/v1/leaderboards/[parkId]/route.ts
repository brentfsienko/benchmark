import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
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
      return jsonData([]);
    }

    const allParticipants: { user_id: string; points: number; progress_count: number }[] = [];
    for (const cid of challengeIds) {
      const { data } = await supabase
        .from("challenge_participants")
        .select("user_id, points, progress_count")
        .eq("challenge_id", cid)
        .order("points", { ascending: false });
      allParticipants.push(...(data ?? []));
    }

    const byUser = allParticipants.reduce(
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

    const entries: LeaderboardEntry[] = sorted.map((s, i) => ({
      userId: s.userId,
      points: s.points,
      progress: s.progress,
      rank: i + 1
    }));
    return jsonData(entries);
  } catch (err) {
    return jsonError("Unable to load leaderboard", "internal_error", 500);
  }
}
