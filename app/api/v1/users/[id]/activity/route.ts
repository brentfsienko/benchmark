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

function rowToItem(r: Record<string, unknown>, likedIds?: Set<string>): ActivityItem {
  const id = String(r.id);
  const photos = Array.isArray(r.photo_base64_items)
    ? (r.photo_base64_items as unknown[]).map((p) => String(p)).filter(Boolean)
    : [];
  return {
    id,
    type: "benchmark",
    userId: String(r.user_id),
    author: r.author ? String(r.author) : undefined,
    username: r.username ? String(r.username) : undefined,
    avatarPhotoURL: r.avatar_photo_url ? String(r.avatar_photo_url) : undefined,
    benchId: String(r.bench_id),
    benchName: String(r.bench_name ?? ""),
    neighborhood: r.neighborhood ? String(r.neighborhood) : undefined,
    latitude: Number.isFinite(Number(r.latitude)) ? Number(r.latitude) : undefined,
    longitude: Number.isFinite(Number(r.longitude)) ? Number(r.longitude) : undefined,
    rating: Number(r.rating),
    body: r.body != null ? String(r.body) : undefined,
    photoBase64Items: photos,
    likeCount: Number(r.like_count ?? 0),
    commentCount: Number(r.comment_count ?? 0),
    likedByMe: likedIds ? likedIds.has(id) : false,
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

async function loadLikedSet(
  supabase: ReturnType<typeof createSupabaseServer>,
  reviewIds: string[],
  userId: string | null
): Promise<Set<string>> {
  if (!userId || reviewIds.length === 0) return new Set();
  const { data } = await supabase
    .from("review_likes")
    .select("review_id")
    .eq("user_id", userId)
    .in("review_id", reviewIds);
  return new Set((data ?? []).map((r: { review_id: string }) => r.review_id));
}

async function loadActivityFallback(
  supabase: ReturnType<typeof createSupabaseServer>,
  feedUserIds: string[],
  limit: number,
  before: string | null,
  viewerId: string | null
): Promise<ActivityItem[]> {
  let query = supabase
    .from("bench_reviews")
    .select("id, user_id, bench_id, rating, body, photo_base64_items, created_at")
    .in("user_id", feedUserIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);

  const { data: reviewRows, error } = await query;
  if (error) throw error;
  const rows = reviewRows ?? [];
  if (rows.length === 0) return [];

  const benchIds = [...new Set(rows.map((r: { bench_id: string }) => r.bench_id))];
  const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
  const reviewIds = rows.map((r: { id: string }) => r.id);

  const [benchesRes, usersRes, likesRes, commentsRes, likedSet, coordsList] = await Promise.all([
    supabase.from("benches").select("id, name, neighborhood").in("id", benchIds),
    supabase.from("users").select("id, display_name, username, avatar_photo_url").in("id", userIds),
    supabase.from("review_likes").select("review_id").in("review_id", reviewIds),
    supabase.from("review_comments").select("review_id").in("review_id", reviewIds),
    loadLikedSet(supabase, reviewIds, viewerId),
    Promise.all(
      benchIds.map(async (benchId) => {
        const { data } = await supabase.rpc("get_bench_coords", { p_id: benchId });
        const row = Array.isArray(data) ? data[0] : data;
        return {
          id: benchId,
          latitude: Number(row?.latitude),
          longitude: Number(row?.longitude)
        };
      })
    )
  ]);

  const benches = (benchesRes.data ?? []).reduce(
    (acc: Record<string, { name: string; neighborhood: string }>, b: { id: string; name: string; neighborhood: string }) => {
      acc[b.id] = { name: b.name, neighborhood: b.neighborhood ?? "" };
      return acc;
    },
    {}
  );
  const users = (usersRes.data ?? []).reduce(
    (
      acc: Record<string, { display_name: string; username: string; avatar_photo_url: string }>,
      u: { id: string; display_name: string; username: string; avatar_photo_url: string }
    ) => {
      acc[u.id] = u;
      return acc;
    },
    {}
  );
  const likeCounts = (likesRes.data ?? []).reduce((acc: Record<string, number>, r: { review_id: string }) => {
    acc[r.review_id] = (acc[r.review_id] ?? 0) + 1;
    return acc;
  }, {});
  const commentCounts = (commentsRes.data ?? []).reduce((acc: Record<string, number>, r: { review_id: string }) => {
    acc[r.review_id] = (acc[r.review_id] ?? 0) + 1;
    return acc;
  }, {});
  const coords = coordsList.reduce(
    (acc: Record<string, { latitude: number; longitude: number }>, c) => {
      if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
        acc[c.id] = { latitude: c.latitude, longitude: c.longitude };
      }
      return acc;
    },
    {}
  );

  return rows.map((r: Record<string, unknown>) => {
    const benchId = String(r.bench_id);
    const userId = String(r.user_id);
    const id = String(r.id);
    const u = users[userId];
    const b = benches[benchId];
    const c = coords[benchId];
    return rowToItem(
      {
        id,
        user_id: userId,
        author: u?.display_name,
        username: u?.username,
        avatar_photo_url: u?.avatar_photo_url,
        bench_id: benchId,
        bench_name: b?.name ?? "",
        neighborhood: b?.neighborhood ?? "",
        latitude: c?.latitude,
        longitude: c?.longitude,
        rating: r.rating,
        body: r.body,
        photo_base64_items: r.photo_base64_items,
        like_count: likeCounts[id] ?? 0,
        comment_count: commentCounts[id] ?? 0,
        created_at: r.created_at
      },
      likedSet
    );
  });
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

    const { data: rpcRows, error: rpcError } = await supabase.rpc("list_activity_feed", {
      p_user_id: id,
      p_feed: feed,
      p_limit: limit,
      p_before: before,
    });

    if (!rpcError) {
      const rows = (rpcRows ?? []) as Record<string, unknown>[];
      const likedSet = await loadLikedSet(
        supabase,
        rows.map((r) => String(r.id)),
        actor?.profileId ?? null
      );
      return jsonData(rows.map((r) => rowToItem(r, likedSet)));
    }

    if (!/list_activity_feed|Could not find the function|photo_base64|like_count/i.test(rpcError.message ?? "")) {
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

    const items = await loadActivityFallback(supabase, feedUserIds, limit, before, actor?.profileId ?? null);
    return jsonData(items);
  } catch (err) {
    console.error("activity route error:", err);
    return jsonError("Unable to load activity", "internal_error", 500);
  }
}
