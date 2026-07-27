import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { BenchPin } from "@/src/lib/types";

function toPin(row: Record<string, unknown>): BenchPin {
  const rawTags = row.tags;
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.map((t) => String(t))
    : [];
  return {
    id: String(row.id),
    name: String(row.name),
    neighborhood: String(row.neighborhood),
    type: String(row.bench_type),
    averageRating: Number(row.average_rating),
    reviewCount: Number(row.review_count ?? 0),
    latitude: Number(row.lat),
    longitude: Number(row.lng),
    tags,
  };
}

export async function GET(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { searchParams } = new URL(request.url);
    const swLat = searchParams.get("sw_lat");
    const swLng = searchParams.get("sw_lng");
    const neLat = searchParams.get("ne_lat");
    const neLng = searchParams.get("ne_lng");
    const minRating = searchParams.get("minRating");
    const zoom = searchParams.get("zoom");
    const limit = searchParams.get("limit");

    if (!swLat || !swLng || !neLat || !neLng) {
      return jsonError("Bounding box params required (sw_lat, sw_lng, ne_lat, ne_lng)", "validation_error", 422);
    }

    const sw_lat = parseFloat(swLat);
    const sw_lng = parseFloat(swLng);
    const ne_lat = parseFloat(neLat);
    const ne_lng = parseFloat(neLng);
    if (![sw_lat, sw_lng, ne_lat, ne_lng].every(Number.isFinite)) {
      return jsonError("Bounding box params must be numbers", "validation_error", 422);
    }
    if (sw_lat < -90 || ne_lat > 90 || sw_lat > ne_lat) {
      return jsonError("Invalid latitude bounds", "validation_error", 422);
    }
    if (Math.abs(sw_lng) > 180 || Math.abs(ne_lng) > 180) {
      return jsonError("Invalid longitude bounds", "validation_error", 422);
    }

    const supabase = createSupabaseServer();
    const rpcArgs: Record<string, number | null> = {
      p_sw_lat: sw_lat,
      p_sw_lng: sw_lng,
      p_ne_lat: ne_lat,
      p_ne_lng: ne_lng,
      p_min_rating: minRating ? parseFloat(minRating) : null,
      p_zoom: zoom ? parseFloat(zoom) : null,
      p_limit: limit ? Math.min(400, Math.max(1, parseInt(limit, 10))) : null,
    };

    let { data: rows, error } = await supabase.rpc("list_bench_pins", rpcArgs);

    // Backward compatible if the DB still has the pre-zoom signature.
    if (error && /p_zoom|p_limit|function .*list_bench_pins/i.test(error.message ?? "")) {
      ({ data: rows, error } = await supabase.rpc("list_bench_pins", {
        p_sw_lat: sw_lat,
        p_sw_lng: sw_lng,
        p_ne_lat: ne_lat,
        p_ne_lng: ne_lng,
        p_min_rating: minRating ? parseFloat(minRating) : null,
      }));
    }

    if (error) {
      console.error("list_bench_pins error:", error);
      return jsonError("Unable to load bench pins", "internal_error", 500);
    }

    const pins: BenchPin[] = (rows ?? []).map((r: Record<string, unknown>) => toPin(r));

    // Short CDN cache — viewport tiles are public catalog data.
    // Mutations (create/move/delete) are rare; clients still request fresh after admin actions.
    return jsonCachedData(pins, 20, 60);
  } catch (err) {
    console.error("benches/pins error:", err);
    return jsonError("Unable to load bench pins", "internal_error", 500);
  }
}
