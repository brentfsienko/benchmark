import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const actor = await getRequestActor();
    const userId = actor?.profileId ?? "";
    if (!userId) return jsonError("Authentication required", "unauthorized", 401);
    const benchmarksAddRaw = Number(body.benchmarksAdd ?? 1);
    if (!Number.isFinite(benchmarksAddRaw)) return jsonError("benchmarksAdd must be a number", "validation_error", 422);
    const benchmarksAdd = Math.floor(Math.max(1, Math.min(benchmarksAddRaw, 20)));

    const supabase = createSupabaseServer();

    const { data: challenge } = await supabase
      .from("challenges")
      .select("points_per_benchmark")
      .eq("id", id)
      .single();

    const pointsPerBench = challenge?.points_per_benchmark ?? 10;
    const pointsToAdd = benchmarksAdd * pointsPerBench;

    const { data: existing } = await supabase
      .from("challenge_participants")
      .select("progress_count, points")
      .eq("challenge_id", id)
      .eq("user_id", userId)
      .single();

    const newProgress = (existing?.progress_count ?? 0) + benchmarksAdd;
    const newPoints = (existing?.points ?? 0) + pointsToAdd;
    const now = new Date().toISOString();

    const { error } = await supabase.from("challenge_participants").upsert(
      {
        challenge_id: id,
        user_id: userId,
        progress_count: newProgress,
        points: newPoints,
        updated_at: now,
        joined_at: existing ? undefined : now
      },
      { onConflict: "challenge_id,user_id" }
    );

    if (error) return jsonError("Unable to record progress", "internal_error", 500);
    return jsonData({ userId, points: newPoints, progress: newProgress });
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
