import { NextRequest } from "next/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { getRequestActor, requireSelfOrAdmin } from "@/src/lib/request-auth";
import { fetchUserSummaries } from "@/src/lib/user-summary";

/**
 * Friends = people you follow (after they accepted your request).
 * With mutual approve, this is a two-way friendship.
 */
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
  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", id);
  if (error) return jsonError("Unable to load friends", "internal_error", 500);

  const ids = (data ?? []).map((r: { following_id: string }) => r.following_id);
  const friends = await fetchUserSummaries(ids);
  return jsonData(friends);
}
