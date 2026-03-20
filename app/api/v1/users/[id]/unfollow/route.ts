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
  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", targetId);
  if (error) return jsonError("Unable to unfollow", "internal_error", 500);
  return jsonData({ unfollowed: true });
}
