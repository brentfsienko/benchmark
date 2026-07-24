import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";

const PARK_NEIGHBORHOOD: Record<string, string[]> = {
  "volunteer-park": ["Volunteer Park"],
  "green-lake": ["Green Lake", "Greenlake"],
};

/**
 * Sync challenge progress from distinct benches the user has reviewed
 * in the challenge park. Ignores client-supplied benchmarksAdd.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const actor = await getRequestActor();
    const userId = actor?.profileId ?? "";
    if (!userId) return jsonError("Authentication required", "unauthorized", 401);

    const supabase = createSupabaseServer();

    const { data: challenge } = await supabase
      .from("challenges")
      .select("id, park_id, points_per_benchmark, is_active")
      .eq("id", id)
      .maybeSingle();

    if (!challenge) return jsonError("Challenge not found", "not_found", 404);

    const parkId = String(challenge.park_id);
    const pointsPerBench = Number(challenge.points_per_benchmark ?? 10);

    // Prefer benches tagged with the park id; fall back to neighborhood names.
    const { data: tagged } = await supabase
      .from("bench_tags")
      .select("bench_id")
      .eq("tag", parkId);

    let benchIds = [...new Set((tagged ?? []).map((r: { bench_id: string }) => r.bench_id))];

    if (benchIds.length === 0) {
      const neighborhoods = PARK_NEIGHBORHOOD[parkId] ?? [];
      if (neighborhoods.length > 0) {
        const { data: benches } = await supabase
          .from("benches")
          .select("id")
          .in("neighborhood", neighborhoods);
        benchIds = (benches ?? []).map((b: { id: string }) => b.id);
      }
    }

    let progressCount = 0;
    if (benchIds.length > 0) {
      const { data: reviews } = await supabase
        .from("bench_reviews")
        .select("bench_id")
        .eq("user_id", userId)
        .in("bench_id", benchIds);
      progressCount = new Set((reviews ?? []).map((r: { bench_id: string }) => r.bench_id)).size;
    }

    const points = progressCount * pointsPerBench;
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("challenge_participants")
      .select("joined_at")
      .eq("challenge_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabase.from("challenge_participants").upsert(
      {
        challenge_id: id,
        user_id: userId,
        progress_count: progressCount,
        points,
        updated_at: now,
        joined_at: existing?.joined_at ?? now,
      },
      { onConflict: "challenge_id,user_id" }
    );

    if (error) return jsonError("Unable to record progress", "internal_error", 500);
    return jsonData({ userId, points, progress: progressCount });
  } catch {
    return jsonError("Unable to record progress", "internal_error", 500);
  }
}
