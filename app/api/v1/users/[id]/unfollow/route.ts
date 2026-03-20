import { NextRequest } from "next/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { getRequestActor } from "@/src/lib/request-auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id: targetId } = await params;
  const actor = await getRequestActor();
  const followerId = actor?.profileId ?? "";
  if (!followerId) return jsonError("Authentication required", "unauthorized", 401);

  const supabase = createSupabaseAdmin();
  const { error: unfollowErr } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", targetId);
  if (unfollowErr) return jsonError("Unable to unfollow", "internal_error", 500);

  const { error: cancelErr } = await supabase
    .from("follow_requests")
    .delete()
    .eq("requester_id", followerId)
    .eq("target_id", targetId)
    .eq("status", "pending");
  if (cancelErr) return jsonError("Unable to cancel request", "internal_error", 500);

  return jsonData({ state: "none" as const });
}
