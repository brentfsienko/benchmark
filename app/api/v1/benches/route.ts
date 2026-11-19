import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";
import { parseBenchSubmission, USER_DAILY_BENCH_LIMIT } from "@/src/lib/bench-submission";
import type { Bench } from "@/src/lib/types";

const DEFAULT_USER_ID = "user-1";

export async function POST(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  // Any signed-in user may add a bench; admins can also set scores and tags.
  const actor = await getRequestActor();
  if (!actor) {
    return jsonError("Sign in to add a bench", "unauthorized", 401);
  }
  if (!actor.isAdmin && !actor.profileId) {
    return jsonError("Finish setting up your profile to add benches", "forbidden", 403);
  }
  try {
    const parsed = parseBenchSubmission(await request.json(), { isAdmin: actor.isAdmin });
    if (!parsed.ok) return jsonError(parsed.error, "validation_error", 422);
    const submission = parsed.value;

    const supabase = createSupabaseServer();

    if (!actor.isAdmin) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from("benches")
        .select("id", { count: "exact", head: true })
        .eq("created_by_user_id", actor.profileId)
        .gte("created_at", since);
      if (countError) {
        console.error("bench daily limit check error:", countError);
        return jsonError("Unable to create bench", "internal_error", 500);
      }
      if ((count ?? 0) >= USER_DAILY_BENCH_LIMIT) {
        return jsonError(
          `You can add up to ${USER_DAILY_BENCH_LIMIT} benches a day. Try again tomorrow.`,
          "rate_limited",
          429
        );
      }
    }

    const id = `bench-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const { data: rows, error } = await supabase.rpc("insert_bench", {
      p_id: id,
      p_name: submission.name,
      p_neighborhood: submission.neighborhood,
      p_bench_type: submission.type,
      p_description: submission.description,
      p_view_score: submission.viewScore,
      p_remoteness_score: submission.remotenessScore,
      p_popularity_score: submission.popularityScore,
      p_average_rating: submission.averageRating,
      p_lat: submission.latitude,
      p_lng: submission.longitude,
      p_created_by_user_id: actor.profileId ?? DEFAULT_USER_ID,
      p_tags: submission.tags
    });

    if (error) {
      console.error("insert_bench error:", error);
      return jsonError("Unable to create bench", "internal_error", 500);
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return jsonError("Unable to create bench", "internal_error", 500);

    const bench: Bench = {
      id: String(row.id),
      name: String(row.name),
      neighborhood: String(row.neighborhood),
      type: String(row.bench_type),
      description: String(row.description ?? ""),
      viewScore: Number(row.view_score),
      remotenessScore: Number(row.remoteness_score),
      popularityScore: Number(row.popularity_score),
      averageRating: Number(row.average_rating),
      distanceMeters: 0,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      tags: submission.tags
    };
    return jsonData(bench, 201);
  } catch (err) {
    console.error("benches POST error:", err);
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
