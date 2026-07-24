import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

export type BenchCard = {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  averageRating: number;
};

/** Slim bench rows for lists (wishlist, etc.) — no coords, tags, or photos. */
export async function GET(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const ids = request.nextUrl.searchParams.get("ids");
    if (!ids) {
      return jsonCachedData<BenchCard[]>([], 60, 300);
    }
    const benchIds = [...new Set(ids.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100);
    if (benchIds.length === 0) {
      return jsonCachedData<BenchCard[]>([], 60, 300);
    }

    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from("benches")
      .select("id, name, neighborhood, bench_type, average_rating")
      .in("id", benchIds);

    if (error) {
      console.error("bench cards error:", error);
      return jsonError("Unable to load benches", "internal_error", 500);
    }

    const byId = new Map(
      (data ?? []).map((row: Record<string, unknown>) => [
        String(row.id),
        {
          id: String(row.id),
          name: String(row.name),
          neighborhood: String(row.neighborhood),
          type: String(row.bench_type),
          averageRating: Number(row.average_rating)
        } satisfies BenchCard
      ])
    );

    const cards = benchIds.map((id) => byId.get(id)).filter(Boolean) as BenchCard[];
    return jsonCachedData(cards, 60, 300);
  } catch (err) {
    console.error("bench cards error:", err);
    return jsonError("Unable to load benches", "internal_error", 500);
  }
}
