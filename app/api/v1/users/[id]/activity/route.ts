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

    const { data: reviewRows, error } = await supabase
      .from("bench_reviews")
      .select("id, bench_id, rating, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return jsonError("Unable to load activity", "internal_error", 500);
    }

    const benchIds = [...new Set((reviewRows ?? []).map((r: { bench_id: string }) => r.bench_id))];
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

    const items: ActivityItem[] = (reviewRows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      type: "benchmark" as const,
      userId: id,
      benchId: String(r.bench_id),
      benchName: benchNames[String(r.bench_id)] ?? "",
      rating: Number(r.rating),
      createdAt: new Date(String(r.created_at)).toISOString()
    }));

    return jsonData(items);
  } catch (err) {
    return jsonError("Unable to load activity", "internal_error", 500);
  }
}
