import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { BenchPin } from "@/src/lib/types";

function toPin(row: Record<string, unknown>): BenchPin {
  const rawTags = row.tags;
  const tags: string[] = Array.isArray(rawTags) ? rawTags.map((t) => String(t)) : [];
  return {
    id: String(row.id),
    name: String(row.name),
    neighborhood: String(row.neighborhood ?? ""),
    type: String(row.bench_type),
    averageRating: Number(row.average_rating),
    reviewCount: Number(row.review_count ?? 0),
    latitude: Number(row.lat),
    longitude: Number(row.lng),
    tags
  };
}

export async function GET(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Math.min(40, Math.max(1, parseInt(limitRaw, 10) || 20)) : 20;

    if (q.length < 2) {
      return jsonCachedData([] as BenchPin[], 15, 30);
    }

    const supabase = createSupabaseServer();
    const { data: rows, error } = await supabase.rpc("search_benches", {
      p_query: q,
      p_limit: limit
    });

    if (error) {
      // Fallback without RPC: name/neighborhood ilike only (no coords join).
      console.error("search_benches error:", error);
      const pattern = `%${q}%`;
      const { data: fallback, error: fbErr } = await supabase
        .from("benches")
        .select("id, name, neighborhood, bench_type, average_rating, review_count")
        .or(
          `name.ilike.${pattern},neighborhood.ilike.${pattern},park_name.ilike.${pattern},site_name.ilike.${pattern}`
        )
        .order("average_rating", { ascending: false })
        .limit(limit);

      if (fbErr) {
        console.error("search fallback error:", fbErr);
        return jsonError("Unable to search benches", "internal_error", 500);
      }

      // Without geom in fallback, return pins at 0,0 — better require RPC.
      // Try get_bench_coords for each (capped).
      const pins: BenchPin[] = [];
      for (const row of fallback ?? []) {
        const { data: geomRows } = await supabase.rpc("get_bench_coords", { p_id: row.id });
        const geom = Array.isArray(geomRows) ? geomRows[0] : geomRows;
        pins.push({
          id: String(row.id),
          name: String(row.name),
          neighborhood: String(row.neighborhood ?? ""),
          type: String(row.bench_type),
          averageRating: Number(row.average_rating),
          reviewCount: Number(row.review_count ?? 0),
          latitude: Number(geom?.latitude ?? 0),
          longitude: Number(geom?.longitude ?? 0),
          tags: []
        });
      }
      return jsonCachedData(pins, 15, 30);
    }

    const pins = (rows ?? []).map((r: Record<string, unknown>) => toPin(r));
    return jsonCachedData(pins, 15, 30);
  } catch (err) {
    console.error("benches/search error:", err);
    return jsonError("Unable to search benches", "internal_error", 500);
  }
}
