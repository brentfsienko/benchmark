import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { Bench } from "@/src/lib/types";

const DEFAULT_USER_ID = "user-1";

export async function POST(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const neighborhood = String(body.neighborhood ?? "").trim();
    const type = String(body.type ?? "park").trim() || "park";
    const description = String(body.description ?? "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const viewScore = Number(body.viewScore ?? 0);
    const remotenessScore = Number(body.remotenessScore ?? 0);
    const popularityScore = Number(body.popularityScore ?? 0);
    const averageRating = Number(body.averageRating ?? 0);
    const tags = Array.isArray(body.tags) ? body.tags : ["user-submitted"];

    if (!name) return jsonError("Name is required", "validation_error", 422);
    if (!neighborhood) return jsonError("Neighborhood is required", "validation_error", 422);
    if (latitude < -90 || latitude > 90) return jsonError("Latitude must be between -90 and 90", "validation_error", 422);
    if (longitude < -180 || longitude > 180) return jsonError("Longitude must be between -180 and 180", "validation_error", 422);

    const id = `bench-${Date.now()}`;
    const supabase = createSupabaseServer();

    const { data: rows, error } = await supabase.rpc("insert_bench", {
      p_id: id,
      p_name: name,
      p_neighborhood: neighborhood,
      p_bench_type: type,
      p_description: description,
      p_view_score: viewScore,
      p_remoteness_score: remotenessScore,
      p_popularity_score: popularityScore,
      p_average_rating: averageRating,
      p_lat: latitude,
      p_lng: longitude,
      p_created_by_user_id: DEFAULT_USER_ID,
      p_tags: tags
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
      tags
    };
    return jsonData(bench, 201);
  } catch (err) {
    console.error("benches POST error:", err);
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
