import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { ActivityItem } from "@/src/lib/types";

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

    const [reviewsRes, visitsRes] = await Promise.all([
      supabase
        .from("bench_reviews")
        .select("id, bench_id, rating, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("bench_visits")
        .select("id, bench_id, visited_at")
        .eq("user_id", id)
        .order("visited_at", { ascending: false })
        .limit(100)
    ]);

    const benchIds = [
      ...new Set([
        ...(reviewsRes.data ?? []).map((r: { bench_id: string }) => r.bench_id),
        ...(visitsRes.data ?? []).map((v: { bench_id: string }) => v.bench_id)
      ])
    ];
    let benchNames: Record<string, string> = {};
    if (benchIds.length > 0) {
      const { data: benches } = await supabase.from("benches").select("id, name").in("id", benchIds);
      benchNames = (benches ?? []).reduce(
        (acc: Record<string, string>, b: { id: string; name: string }) => {
          acc[b.id] = b.name;
          return acc;
        },
        {}
      );
    }

    const items: ActivityItem[] = [];
    for (const r of reviewsRes.data ?? []) {
      items.push({
        id: `review-${r.id}`,
        type: "review",
        userId: id,
        benchId: r.bench_id,
        benchName: benchNames[r.bench_id] ?? "",
        rating: r.rating,
        createdAt: new Date(r.created_at).toISOString()
      });
    }
    for (const v of visitsRes.data ?? []) {
      items.push({
        id: `visit-${v.id}`,
        type: "visit",
        userId: id,
        benchId: v.bench_id,
        benchName: benchNames[v.bench_id] ?? "",
        createdAt: new Date(v.visited_at).toISOString()
      });
    }
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return jsonData(items.slice(0, 200));
  } catch (err) {
    return jsonError("Unable to load activity", "internal_error", 500);
  }
}
