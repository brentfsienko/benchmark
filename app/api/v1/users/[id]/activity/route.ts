import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import {
  canViewUserPrivateData,
  getRequestActor,
  requireSelfOrAdmin,
} from "@/src/lib/request-auth";
import type { ActivityItem } from "@/src/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const feed = request.nextUrl.searchParams.get("feed") === "true";
    const actor = await getRequestActor();
    const supabase = createSupabaseServer();

    const { data: targetUser } = await supabase
      .from("users")
      .select("id, is_public_profile")
      .eq("id", id)
      .maybeSingle();
    if (!targetUser) return jsonError("User not found", "user_not_found", 404);

    let feedUserIds = [id];
    if (feed) {
      if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
      if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);
      const { data: followingRows, error: followingErr } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", id);
      if (followingErr) {
        return jsonError("Unable to load feed connections", "internal_error", 500);
      }
      feedUserIds = [
        id,
        ...((followingRows ?? []).map((r: { following_id: string }) => r.following_id)),
      ];
    } else {
      const allowed = await canViewUserPrivateData(
        actor,
        id,
        Boolean(targetUser.is_public_profile ?? true)
      );
      if (!allowed) return jsonError("Forbidden", "forbidden", 403);
    }

    const { data: reviewRows, error } = await supabase
      .from("bench_reviews")
      .select("id, user_id, bench_id, rating, created_at")
      .in("user_id", feedUserIds)
      .order("created_at", { ascending: false })
      .limit(feed ? 300 : 200);

    if (error) {
      return jsonError("Unable to load activity", "internal_error", 500);
    }

    const benchIds = [...new Set((reviewRows ?? []).map((r: { bench_id: string }) => r.bench_id))];
    const userIds = [...new Set((reviewRows ?? []).map((r: { user_id: string }) => r.user_id))];
    let benchNames: Record<string, string> = {};
    let userNames: Record<string, string> = {};
    if (benchIds.length > 0) {
      const { data: benches } = await supabase.from("benches").select("id, name").in("id", benchIds);
      benchNames = (benches ?? []).reduce(
        (acc: Record<string, string>, b: { id: string; name: string }) => {
          acc[b.id] = b.name;
          return acc;
        },
        {}
      );
    }
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, display_name").in("id", userIds);
      userNames = (users ?? []).reduce(
        (acc: Record<string, string>, u: { id: string; display_name: string }) => {
          acc[u.id] = u.display_name;
          return acc;
        },
        {}
      );
    }

    const items: ActivityItem[] = (reviewRows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      type: "benchmark" as const,
      userId: String(r.user_id),
      author: userNames[String(r.user_id)] ?? undefined,
      benchId: String(r.bench_id),
      benchName: benchNames[String(r.bench_id)] ?? "",
      rating: Number(r.rating),
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));

    return jsonData(items);
  } catch {
    return jsonError("Unable to load activity", "internal_error", 500);
  }
}
