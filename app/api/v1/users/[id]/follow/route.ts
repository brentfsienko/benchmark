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
  const { error } = await supabase.from("user_follows").insert({
    follower_id: followerId,
    following_id: targetId
  });
  if (error) {
    if (error.code === "23505") return jsonData({ followed: true });
    return jsonError("Unable to follow", "internal_error", 500);
  }
  return jsonData({ followed: true });
}
