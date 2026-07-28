import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";
import type { ReviewComment } from "@/src/lib/types";

const MAX_COMMENT_CHARS = 500;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id: reviewId } = await params;
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("review_comments")
    .select("id, review_id, user_id, body, created_at")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("comments list error:", error);
    return jsonError("Unable to load comments", "internal_error", 500);
  }

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
  let names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, display_name").in("id", userIds);
    names = (users ?? []).reduce(
      (acc: Record<string, string>, u: { id: string; display_name: string }) => {
        acc[u.id] = u.display_name || "community member";
        return acc;
      },
      {}
    );
  }

  const comments: ReviewComment[] = rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    reviewId: String(r.review_id),
    userId: String(r.user_id),
    author: names[String(r.user_id)] ?? "community member",
    body: String(r.body ?? ""),
    createdAt: new Date(String(r.created_at)).toISOString()
  }));
  return jsonData(comments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id: reviewId } = await params;
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);

  const payload = await request.json().catch(() => ({}));
  const body = String(payload.body ?? "").trim();
  if (!body) return jsonError("Comment required", "validation_error", 422);
  if (body.length > MAX_COMMENT_CHARS) {
    return jsonError(`Comment must be ${MAX_COMMENT_CHARS} characters or fewer`, "validation_error", 422);
  }

  const supabase = createSupabaseServer();
  const { data: review } = await supabase.from("bench_reviews").select("id").eq("id", reviewId).maybeSingle();
  if (!review) return jsonError("Review not found", "not_found", 404);

  const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.from("review_comments").insert({
    id,
    review_id: reviewId,
    user_id: actor.profileId,
    body
  });
  if (error) {
    console.error("comment insert error:", error);
    return jsonError("Unable to add comment", "internal_error", 500);
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", actor.profileId)
    .maybeSingle();

  const comment: ReviewComment = {
    id,
    reviewId,
    userId: actor.profileId,
    author: userRow?.display_name || "you",
    body,
    createdAt: new Date().toISOString()
  };
  return jsonData(comment);
}
