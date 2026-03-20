import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { Challenge } from "@/src/lib/types";

export async function GET(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId")?.trim();
    const includeInactive = searchParams.get("includeInactive") === "true";

    const supabase = createSupabaseServer();
    let query = supabase
      .from("challenges")
      .select("id, park_id, title, description, starts_at, ends_at, points_per_benchmark, is_active")
      .order("starts_at", { ascending: false });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (parkId) {
      query = query.eq("park_id", parkId);
    }

    const { data, error } = await query;

    if (error) return jsonError("Unable to load challenges", "internal_error", 500);

    const challenges: Challenge[] = (data ?? []).map((c: Record<string, unknown>) => ({
      id: String(c.id),
      parkId: String(c.park_id),
      title: String(c.title),
      description: String(c.description ?? ""),
      startsAt: new Date(String(c.starts_at)).toISOString(),
      endsAt: new Date(String(c.ends_at)).toISOString(),
      pointsPerBenchmark: Number(c.points_per_benchmark ?? 10),
      isActive: Boolean(c.is_active)
    }));
    return jsonData(challenges);
  } catch (err) {
    return jsonError("Unable to load challenges", "internal_error", 500);
  }
}
