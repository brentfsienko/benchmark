import { NextRequest } from "next/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { getRequestActor } from "@/src/lib/request-auth";
import type { FollowRelationshipState } from "@/src/lib/types";

/**
 * GET /api/v1/users/search?q=...
 * Username / display-name search for finding friends.
 */
export async function GET(request: NextRequest) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const safe = q.replace(/[%_,.()]/g, "").slice(0, 40);
  if (safe.length < 2) {
    return jsonError("Query must be at least 2 characters", "validation_error", 422);
  }
  const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20) || 20));

  const actor = await getRequestActor();
  const selfId = actor?.profileId ?? null;
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_photo_url")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .order("username", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("users search error:", error);
    return jsonError("Unable to search users", "internal_error", 500);
  }

  const rows = (data ?? []).filter((u: { id: string }) => u.id !== selfId);

  let followingIds = new Set<string>();
  let outgoingIds = new Set<string>();
  if (selfId && rows.length > 0) {
    const ids = rows.map((u: { id: string }) => u.id);
    const [followingRes, outgoingRes] = await Promise.all([
      supabase.from("user_follows").select("following_id").eq("follower_id", selfId).in("following_id", ids),
      supabase
        .from("follow_requests")
        .select("target_id")
        .eq("requester_id", selfId)
        .eq("status", "pending")
        .in("target_id", ids)
    ]);
    followingIds = new Set((followingRes.data ?? []).map((r: { following_id: string }) => r.following_id));
    outgoingIds = new Set((outgoingRes.data ?? []).map((r: { target_id: string }) => r.target_id));
  }

  const results = rows.map(
    (u: { id: string; username: string; display_name: string; avatar_photo_url: string | null }) => {
      let relationship: FollowRelationshipState = "none";
      if (followingIds.has(u.id)) relationship = "following";
      else if (outgoingIds.has(u.id)) relationship = "requested";
      return {
        id: u.id,
        username: String(u.username ?? ""),
        displayName: String(u.display_name ?? u.username ?? ""),
        avatarPhotoURL: String(u.avatar_photo_url ?? ""),
        relationship
      };
    }
  );

  return jsonData(results);
}
