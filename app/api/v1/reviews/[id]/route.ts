import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";
import {
  MAX_PHOTO_BASE64_CHARS,
  MAX_PHOTOS_PER_REVIEW
} from "@/src/lib/photo-limits";
import type { BenchReview } from "@/src/lib/types";

const FALLBACK_AUTHOR = "community member";
const MAX_REVIEW_BODY_CHARS = 1000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id: reviewId } = await params;
  const actor = await getRequestActor();
  if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);

  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseServer();

  const { data: existing, error: loadErr } = await supabase
    .from("bench_reviews")
    .select("id, bench_id, user_id, rating, body, photo_base64_items, created_at")
    .eq("id", reviewId)
    .maybeSingle();
  if (loadErr) return jsonError("Unable to load review", "internal_error", 500);
  if (!existing) return jsonError("Review not found", "not_found", 404);
  if (existing.user_id !== actor.profileId && !actor.isAdmin) {
    return jsonError("Forbidden", "forbidden", 403);
  }

  const updates: Record<string, unknown> = {};
  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return jsonError("Rating must be between 0 and 5", "validation_error", 422);
    }
    updates.rating = rating;
  }
  if (body.body !== undefined) {
    const reviewBody = String(body.body ?? "").trim();
    if (reviewBody.length > MAX_REVIEW_BODY_CHARS) {
      return jsonError(`Review must be ${MAX_REVIEW_BODY_CHARS} characters or fewer`, "validation_error", 422);
    }
    updates.body = reviewBody;
  }
  if (body.photoBase64Items !== undefined) {
    const photos = Array.isArray(body.photoBase64Items)
      ? body.photoBase64Items.map((p: unknown) => String(p))
      : [];
    if (photos.length > MAX_PHOTOS_PER_REVIEW) {
      return jsonError(`Maximum ${MAX_PHOTOS_PER_REVIEW} photos per review`, "validation_error", 422);
    }
    if (photos.some((p: string) => p.length > MAX_PHOTO_BASE64_CHARS)) {
      return jsonError("One or more photos are too large", "validation_error", 422);
    }
    updates.photo_base64_items = photos;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No changes provided", "validation_error", 422);
  }

  const { error: updateErr } = await supabase.from("bench_reviews").update(updates).eq("id", reviewId);
  if (updateErr) return jsonError("Unable to update review", "internal_error", 500);

  const { data: userRow } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", existing.user_id)
    .maybeSingle();

  const review: BenchReview = {
    id: reviewId,
    benchId: String(existing.bench_id),
    userId: String(existing.user_id),
    author: userRow?.display_name || FALLBACK_AUTHOR,
    rating: Number(updates.rating ?? existing.rating),
    body: String(updates.body ?? existing.body ?? ""),
    photoBase64Items: Array.isArray(updates.photo_base64_items)
      ? (updates.photo_base64_items as string[])
      : Array.isArray(existing.photo_base64_items)
        ? existing.photo_base64_items
        : [],
    createdAt: new Date(String(existing.created_at)).toISOString()
  };
  return jsonData(review);
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
  const { data: existing } = await supabase
    .from("bench_reviews")
    .select("id, user_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!existing) return jsonError("Review not found", "not_found", 404);
  if (existing.user_id !== actor.profileId && !actor.isAdmin) {
    return jsonError("Forbidden", "forbidden", 403);
  }

  const { error } = await supabase.from("bench_reviews").delete().eq("id", reviewId);
  if (error) return jsonError("Unable to delete review", "internal_error", 500);
  return jsonData({ ok: true });
}
