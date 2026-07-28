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
  // Mutual friendship: removing a friend drops both follow edges.
  const [unfollowA, unfollowB, cancelOut, cancelIn] = await Promise.all([
    supabase.from("user_follows").delete().eq("follower_id", followerId).eq("following_id", targetId),
    supabase.from("user_follows").delete().eq("follower_id", targetId).eq("following_id", followerId),
    supabase
      .from("follow_requests")
      .delete()
      .eq("requester_id", followerId)
      .eq("target_id", targetId)
      .eq("status", "pending"),
    supabase
      .from("follow_requests")
      .delete()
      .eq("requester_id", targetId)
      .eq("target_id", followerId)
      .eq("status", "pending")
  ]);
  if (unfollowA.error || unfollowB.error || cancelOut.error || cancelIn.error) {
    return jsonError("Unable to unfollow", "internal_error", 500);
  }

  return jsonData({ state: "none" as const });
}
