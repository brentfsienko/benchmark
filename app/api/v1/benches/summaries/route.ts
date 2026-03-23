import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
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
      return jsonCachedData<BenchSummary[]>([], 60, 300);
    }
    const benchIds = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (benchIds.length === 0) {
      return jsonCachedData<BenchSummary[]>([], 60, 300);
    }

    const supabase = createSupabaseServer();

    const [countRes, photoRes] = await Promise.all([
      supabase
        .from("bench_reviews")
        .select("bench_id")
        .in("bench_id", benchIds),
      supabase
        .from("bench_reviews")
        .select("bench_id, photo_base64_items")
        .in("bench_id", benchIds)
        .not("photo_base64_items", "is", null)
        .order("created_at", { ascending: false })
        .limit(benchIds.length),
    ]);

    if (countRes.error) {
      console.error("bench summaries count error:", countRes.error);
      return jsonError("Unable to load summaries", "internal_error", 500);
    }

    const countMap: Record<string, number> = {};
    for (const r of countRes.data ?? []) {
      const bid = String(r.bench_id);
      countMap[bid] = (countMap[bid] ?? 0) + 1;
    }

    const photoMap: Record<string, string> = {};
    for (const r of photoRes.data ?? []) {
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

    return jsonCachedData(summaries, 60, 300);
  } catch (err) {
    console.error("bench summaries error:", err);
    return jsonError("Unable to load summaries", "internal_error", 500);
  }
}
