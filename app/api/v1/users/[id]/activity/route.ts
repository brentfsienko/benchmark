import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import {
  canViewUserPrivateData,
  getRequestActor,
  requireSelfOrAdmin,
} from "@/src/lib/request-auth";
import type { ActivityItem } from "@/src/lib/types";

function parseLimit(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

function rowToItem(r: Record<string, unknown>): ActivityItem {
  return {
    id: String(r.id),
    type: "benchmark",
    userId: String(r.user_id),
    author: r.author ? String(r.author) : undefined,
    benchId: String(r.bench_id),
    benchName: String(r.bench_name ?? ""),
    rating: Number(r.rating),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

async function loadActivityFallback(
  supabase: ReturnType<typeof createSupabaseServer>,
  feedUserIds: string[],
  limit: number,
  before: string | null
): Promise<ActivityItem[]> {
  let query = supabase
    .from("bench_reviews")
    .select("id, user_id, bench_id, rating, created_at")
    .in("user_id", feedUserIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: reviewRows, error } = await query;
  if (error) throw error;

  const rows = reviewRows ?? [];
  if (rows.length === 0) return [];

  const benchIds = [...new Set(rows.map((r: { bench_id: string }) => r.bench_id))];
  const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];

  const [benchesRes, usersRes] = await Promise.all([
    supabase.from("benches").select("id, name").in("id", benchIds),
    supabase.from("users").select("id, display_name").in("id", userIds),
  ]);

  const benchNames = (benchesRes.data ?? []).reduce(
    (acc: Record<string, string>, b: { id: string; name: string }) => {
      acc[b.id] = b.name;
      return acc;
    },
    {}
  );
  const userNames = (usersRes.data ?? []).reduce(
    (acc: Record<string, string>, u: { id: string; display_name: string }) => {
      acc[u.id] = u.display_name;
      return acc;
    },
    {}
  );

  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    type: "benchmark" as const,
    userId: String(r.user_id),
    author: userNames[String(r.user_id)] ?? undefined,
    benchId: String(r.bench_id),
    benchName: benchNames[String(r.bench_id)] ?? "",
    rating: Number(r.rating),
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

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
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"), feed ? 15 : 20);
    const beforeRaw = request.nextUrl.searchParams.get("before");
    const before =
      beforeRaw && !Number.isNaN(Date.parse(beforeRaw))
        ? new Date(beforeRaw).toISOString()
        : null;

    const actor = await getRequestActor();
    const supabase = createSupabaseServer();

    if (feed) {
      if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
      if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);
    } else {
      const { data: targetUser } = await supabase
        .from("users")
        .select("id, is_public_profile")
        .eq("id", id)
        .maybeSingle();
      if (!targetUser) return jsonError("User not found", "user_not_found", 404);
      const allowed = await canViewUserPrivateData(
        actor,
        id,
        Boolean(targetUser.is_public_profile ?? true)
      );
      if (!allowed) return jsonError("Forbidden", "forbidden", 403);
    }

    // Prefer single-round-trip RPC when available.
    const { data: rpcRows, error: rpcError } = await supabase.rpc("list_activity_feed", {
      p_user_id: id,
      p_feed: feed,
      p_limit: limit,
      p_before: before,
    });

    if (!rpcError) {
      return jsonData((rpcRows ?? []).map((r: Record<string, unknown>) => rowToItem(r)));
    }

    // Fallback if migration not applied yet.
    if (!/list_activity_feed|Could not find the function/i.test(rpcError.message ?? "")) {
      console.error("list_activity_feed error:", rpcError);
    }

    let feedUserIds = [id];
    if (feed) {
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
    }

    const items = await loadActivityFallback(supabase, feedUserIds, limit, before);
    return jsonData(items);
  } catch (err) {
    console.error("activity route error:", err);
    return jsonError("Unable to load activity", "internal_error", 500);
  }
}
