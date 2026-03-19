import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

export async function GET(_request: NextRequest) {
  if (!hasSupabase()) {
    return jsonData([]);
  }
  try {
    const supabase = createSupabaseServer();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("product_events")
      .select("event_name")
      .gte("created_at", since);

    if (error) return jsonError("Unable to read event summary", "internal_error", 500);

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const name = row.event_name;
      counts[name] = (counts[name] ?? 0) + 1;
    }

    const summary = Object.entries(counts)
      .map(([eventName, count]) => ({ eventName, count }))
      .sort((a, b) => b.count - a.count);
    return jsonData(summary);
  } catch (err) {
    return jsonError("Unable to read event summary", "internal_error", 500);
  }
}
