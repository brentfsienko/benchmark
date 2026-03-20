import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";

const ALLOWED_EVENT_SOURCES = new Set(["web", "ios", "android", "server"]);
const MAX_EVENT_NAME_CHARS = 80;
const MAX_BENCH_ID_CHARS = 80;
const MAX_METADATA_CHARS = 20_000;

export async function POST(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonData({ id: `event-${Date.now()}` }, 201);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = String(body.eventName ?? body.name ?? "").trim();
    const actor = await getRequestActor();
    const userId = actor?.profileId ?? "";
    if (!userId) return jsonError("Authentication required", "unauthorized", 401);
    const benchId = String(body.benchId ?? body.bench_id ?? "").trim();
    const source = String(body.source ?? "web").trim() || "web";
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!eventName) {
      return jsonError("eventName is required", "validation_error", 422);
    }
    if (eventName.length > MAX_EVENT_NAME_CHARS) {
      return jsonError("eventName is too long", "validation_error", 422);
    }
    if (benchId.length > MAX_BENCH_ID_CHARS) {
      return jsonError("benchId is too long", "validation_error", 422);
    }
    if (!ALLOWED_EVENT_SOURCES.has(source)) {
      return jsonError("Invalid source", "validation_error", 422);
    }
    if (JSON.stringify(metadata).length > MAX_METADATA_CHARS) {
      return jsonError("metadata payload too large", "validation_error", 422);
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
