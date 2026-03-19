import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

export async function POST(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonData({ id: `event-${Date.now()}` }, 201);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = String(body.eventName ?? body.name ?? "").trim();
    const userId = String(body.userId ?? body.user_id ?? "").trim();
    const benchId = String(body.benchId ?? body.bench_id ?? "").trim();
    const source = String(body.source ?? "web").trim() || "web";
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!eventName) {
      return jsonError("eventName is required", "validation_error", 422);
    }

    const id = `event-${Date.now()}`;
    const supabase = createSupabaseServer();

    const { error } = await supabase.from("product_events").insert({
      id,
      event_name: eventName,
      user_id: userId,
      bench_id: benchId,
      metadata: metadata,
      source
    });

    if (error) return jsonError("Unable to store event", "internal_error", 500);
    return jsonData({ id }, 201);
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
