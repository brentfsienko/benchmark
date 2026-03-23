import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { Bench } from "@/src/lib/types";

function toBench(row: Record<string, unknown>): Bench {
  const rawTags = row.tags;
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.map(String)
    : [];
  return {
    id: String(row.id),
    name: String(row.name),
    neighborhood: String(row.neighborhood),
    type: String(row.bench_type),
    description: String(row.description),
    viewScore: Number(row.view_score),
    remotenessScore: Number(row.remoteness_score),
    popularityScore: Number(row.popularity_score),
    averageRating: Number(row.average_rating),
    distanceMeters: Number(row.distance_meters ?? 0),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    tags,
  };
}

export async function GET(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radiusMeters = searchParams.get("radiusMeters");
    const minRating = searchParams.get("minRating");
    const minViewScore = searchParams.get("minViewScore");
    const minRemotenessScore = searchParams.get("minRemotenessScore");
    const type = searchParams.get("type");

    const supabase = createSupabaseServer();
    const { data: rows, error } = await supabase.rpc("list_nearby_benches", {
      p_lat: lat ? parseFloat(lat) : null,
      p_lng: lng ? parseFloat(lng) : null,
      p_radius_meters: radiusMeters ? parseFloat(radiusMeters) : null,
      p_min_rating: minRating ? parseFloat(minRating) : null,
      p_min_view_score: minViewScore ? parseFloat(minViewScore) : null,
      p_min_remoteness_score: minRemotenessScore ? parseFloat(minRemotenessScore) : null,
      p_bench_type: type || null,
    });

    if (error) {
      console.error("list_nearby_benches error:", error);
      return jsonError("Unable to load benches", "internal_error", 500);
    }

    const benches: Bench[] = (rows ?? []).map((r: Record<string, unknown>) => toBench(r));
    return jsonCachedData(benches, 30, 120);
  } catch (err) {
    console.error("benches/nearby error:", err);
    return jsonError("Unable to load benches", "internal_error", 500);
  }
}
