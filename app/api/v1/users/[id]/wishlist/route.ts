import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor, requireSelfOrAdmin } from "@/src/lib/request-auth";

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

    const { data, error } = await supabase
      .from("wishlist_items")
      .select("bench_id")
      .eq("user_id", id)
      .order("created_at", { ascending: false });

    if (error) return jsonError("Unable to load wishlist", "internal_error", 500);
    return jsonData((data ?? []).map((r: { bench_id: string }) => r.bench_id));
  } catch (err) {
    return jsonError("Unable to load wishlist", "internal_error", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const actor = await getRequestActor();
    if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
    if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);

    const body = await request.json().catch(() => ({}));
    const benchId = String(body.benchId ?? body.bench_id ?? "").trim();
    if (!benchId) return jsonError("benchId is required", "validation_error", 422);

    const supabase = createSupabaseServer();
    const { error } = await supabase.from("wishlist_items").upsert(
      { user_id: id, bench_id: benchId },
      { onConflict: "user_id,bench_id" }
    );

    if (error) return jsonError("Unable to add wishlist item", "internal_error", 500);
    return jsonData({ benchId }, 201);
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
