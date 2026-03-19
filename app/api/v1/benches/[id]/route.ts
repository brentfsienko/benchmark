import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { Bench } from "@/src/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const supabase = createSupabaseServer();

    const { data: benchRow, error } = await supabase
      .from("benches")
      .select("id, name, neighborhood, bench_type, description, view_score, remoteness_score, popularity_score, average_rating")
      .eq("id", id)
      .single();

    if (error || !benchRow) {
      return jsonError("Bench not found", "bench_not_found", 404);
    }

    const { data: geomRows } = await supabase.rpc("get_bench_coords", { p_id: id });
    const geomRow = Array.isArray(geomRows) ? geomRows[0] : geomRows;
    const { data: tagRows } = await supabase.from("bench_tags").select("tag").eq("bench_id", id);

    const lat = geomRow?.latitude ?? 0;
    const lng = geomRow?.longitude ?? 0;
    const tags = (tagRows ?? []).map((r: { tag: string }) => r.tag);

    const bench: Bench = {
      id: benchRow.id,
      name: benchRow.name,
      neighborhood: benchRow.neighborhood,
      type: benchRow.bench_type,
      description: benchRow.description ?? "",
      viewScore: Number(benchRow.view_score),
      remotenessScore: Number(benchRow.remoteness_score),
      popularityScore: Number(benchRow.popularity_score),
      averageRating: Number(benchRow.average_rating),
      distanceMeters: 0,
      latitude: lat,
      longitude: lng,
      tags
    };
    return jsonData(bench);
  } catch (err) {
    console.error("benches/[id] error:", err);
    return jsonError("Unable to load bench", "internal_error", 500);
  }
}
