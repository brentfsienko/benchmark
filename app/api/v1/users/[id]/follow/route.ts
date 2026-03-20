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
  if (followerId === targetId) return jsonError("Cannot follow yourself", "validation_error", 422);

  const supabase = createSupabaseAdmin();
  const { data: alreadyFollowing } = await supabase
    .from("user_follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", targetId)
    .maybeSingle();
  if (alreadyFollowing) {
    return jsonData({ state: "following" as const });
  }

  const { error } = await supabase.from("follow_requests").upsert(
    {
      requester_id: followerId,
      target_id: targetId,
      status: "pending",
      updated_at: new Date().toISOString()
    },
    { onConflict: "requester_id,target_id" }
  );
  if (error) {
    return jsonError("Unable to send follow request", "internal_error", 500);
  }
  return jsonData({ state: "requested" as const });
}
