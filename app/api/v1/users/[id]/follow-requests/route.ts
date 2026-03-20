import { NextRequest } from "next/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { getRequestActor, requireSelfOrAdmin } from "@/src/lib/request-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id } = await params;
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
  if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);

  const supabase = createSupabaseAdmin();
  const [incomingRes, outgoingRes] = await Promise.all([
    supabase.from("follow_requests").select("requester_id").eq("target_id", id).eq("status", "pending"),
    supabase.from("follow_requests").select("target_id").eq("requester_id", id).eq("status", "pending")
  ]);
  if (incomingRes.error || outgoingRes.error) {
    return jsonError("Unable to load follow requests", "internal_error", 500);
  }

  return jsonData({
    incoming: (incomingRes.data ?? []).map((r: { requester_id: string }) => r.requester_id),
    outgoing: (outgoingRes.data ?? []).map((r: { target_id: string }) => r.target_id)
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id } = await params;
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
  if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);

  const body = await request.json().catch(() => ({}));
  const otherUserId = String(body.otherUserId ?? "").trim();
  const action = String(body.action ?? "").trim().toLowerCase();
  if (!otherUserId) return jsonError("otherUserId required", "validation_error", 422);
  if (!["approve", "reject", "cancel"].includes(action)) return jsonError("Invalid action", "validation_error", 422);

  const supabase = createSupabaseAdmin();

  if (action === "cancel") {
    const { error } = await supabase
      .from("follow_requests")
      .delete()
      .eq("requester_id", id)
      .eq("target_id", otherUserId)
      .eq("status", "pending");
    if (error) return jsonError("Unable to cancel request", "internal_error", 500);
    return jsonData({ ok: true });
  }

  const { data: reqRow } = await supabase
    .from("follow_requests")
    .select("requester_id, target_id")
    .eq("requester_id", otherUserId)
    .eq("target_id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (!reqRow) return jsonError("Request not found", "not_found", 404);

  if (action === "approve") {
    const now = new Date().toISOString();
    const [updateReq, insertFollow] = await Promise.all([
      supabase
        .from("follow_requests")
        .update({ status: "accepted", updated_at: now })
        .eq("requester_id", otherUserId)
        .eq("target_id", id),
      supabase.from("user_follows").upsert({ follower_id: otherUserId, following_id: id }, { onConflict: "follower_id,following_id" })
    ]);
    if (updateReq.error || insertFollow.error) return jsonError("Unable to approve request", "internal_error", 500);
    return jsonData({ ok: true });
  }

  const { error } = await supabase
    .from("follow_requests")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("requester_id", otherUserId)
    .eq("target_id", id);
  if (error) return jsonError("Unable to reject request", "internal_error", 500);
  return jsonData({ ok: true });
}
