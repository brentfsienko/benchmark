import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id: reviewId } = await params;
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);

  const supabase = createSupabaseServer();
  // Skip pre-check + recount: FK enforces review exists; client owns optimistic count.
  const { error } = await supabase
    .from("review_likes")
    .upsert({ review_id: reviewId, user_id: actor.profileId }, { onConflict: "review_id,user_id" });
  if (error) {
    console.error("like upsert error:", error);
    if (error.code === "23503") return jsonError("Review not found", "not_found", 404);
    return jsonError("Unable to like review", "internal_error", 500);
  }

  return jsonData({ liked: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id: reviewId } = await params;
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);

  const supabase = createSupabaseServer();
  const { error } = await supabase
    .from("review_likes")
    .delete()
    .eq("review_id", reviewId)
    .eq("user_id", actor.profileId);
  if (error) return jsonError("Unable to unlike review", "internal_error", 500);

  return jsonData({ liked: false });
}
