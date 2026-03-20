import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

export type BenchSummary = {
  benchId: string;
  reviewCount: number;
  topPhoto: string | null;
};

export async function GET(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const ids = request.nextUrl.searchParams.get("ids");
    if (!ids) {
      return jsonData<BenchSummary[]>([]);
    }
    const benchIds = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (benchIds.length === 0) {
      return jsonData<BenchSummary[]>([]);
    }

    const supabase = createSupabaseServer();

    // Query 1: lightweight count (no photo data transferred)
    const { data: countRows, error: countErr } = await supabase
      .from("bench_reviews")
      .select("bench_id")
      .in("bench_id", benchIds);

    if (countErr) {
      console.error("bench summaries count error:", countErr);
      return jsonError("Unable to load summaries", "internal_error", 500);
    }

    const countMap: Record<string, number> = {};
    for (const r of countRows ?? []) {
      const bid = String(r.bench_id);
      countMap[bid] = (countMap[bid] ?? 0) + 1;
    }

    // Query 2: only reviews that actually have photos, limited to 1 per bench
    // Fetch newest first so we get the most recent photo per bench
    const { data: photoRows } = await supabase
      .from("bench_reviews")
      .select("bench_id, photo_base64_items")
      .in("bench_id", benchIds)
      .not("photo_base64_items", "is", null)
      .order("created_at", { ascending: false });

    const photoMap: Record<string, string> = {};
    for (const r of photoRows ?? []) {
      const bid = String(r.bench_id);
      if (bid in photoMap) continue;
      const photos = Array.isArray(r.photo_base64_items) ? r.photo_base64_items : [];
      if (photos.length > 0) {
        photoMap[bid] = String(photos[0]);
      }
    }

    const summaries: BenchSummary[] = benchIds.map((id) => ({
      benchId: id,
      reviewCount: countMap[id] ?? 0,
      topPhoto: photoMap[id] ?? null
    }));

    return jsonData(summaries);
  } catch (err) {
    console.error("bench summaries error:", err);
    return jsonError("Unable to load summaries", "internal_error", 500);
  }
}
