import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { BenchPin } from "@/src/lib/types";

function toPin(row: Record<string, unknown>): BenchPin {
  return {
    id: String(row.id),
    name: String(row.name),
    neighborhood: String(row.neighborhood),
    type: String(row.bench_type),
    averageRating: Number(row.average_rating),
    latitude: Number(row.lat),
    longitude: Number(row.lng),
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

    if (!swLat || !swLng || !neLat || !neLng) {
      return jsonError("Bounding box params required (sw_lat, sw_lng, ne_lat, ne_lng)", "validation_error", 422);
    }

    const supabase = createSupabaseServer();
    const { data: rows, error } = await supabase.rpc("list_bench_pins", {
      p_sw_lat: parseFloat(swLat),
      p_sw_lng: parseFloat(swLng),
      p_ne_lat: parseFloat(neLat),
      p_ne_lng: parseFloat(neLng),
      p_min_rating: minRating ? parseFloat(minRating) : null,
    });

    if (error) {
      console.error("list_bench_pins error:", error);
      return jsonError("Unable to load bench pins", "internal_error", 500);
    }

    const pins: BenchPin[] = (rows ?? []).map((r: Record<string, unknown>) => toPin(r));
    return jsonCachedData(pins, 60, 300);
  } catch (err) {
    console.error("benches/pins error:", err);
    return jsonError("Unable to load bench pins", "internal_error", 500);
  }
}
