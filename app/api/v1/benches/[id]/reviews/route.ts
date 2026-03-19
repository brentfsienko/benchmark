import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { BenchReview } from "@/src/lib/types";

const FALLBACK_AUTHOR = "community member";
const DEFAULT_USER_ID = "user-1";
const DEFAULT_AUTHOR = "Keith Backdoor";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const supabase = createSupabaseServer();

    const { data: reviewRows, error } = await supabase
      .from("bench_reviews")
      .select("id, bench_id, user_id, rating, body, photo_base64_items, created_at")
      .eq("bench_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError("Unable to load reviews", "internal_error", 500);
    }

    const userIds = [...new Set((reviewRows ?? []).map((r: { user_id: string }) => r.user_id))];
    let usersMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: userRows } = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", userIds);
      usersMap = (userRows ?? []).reduce(
        (acc: Record<string, string>, u: { id: string; display_name: string }) => {
          acc[u.id] = u.display_name || FALLBACK_AUTHOR;
          return acc;
        },
        {}
      );
    }

    const reviews: BenchReview[] = (reviewRows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      benchId: String(r.bench_id),
      userId: String(r.user_id),
      author: usersMap[String(r.user_id)] ?? FALLBACK_AUTHOR,
      rating: Number(r.rating),
      body: String(r.body ?? ""),
      photoBase64Items: Array.isArray(r.photo_base64_items) ? r.photo_base64_items : [],
      createdAt: new Date(String(r.created_at)).toISOString()
    }));
    return jsonData(reviews);
  } catch (err) {
    console.error("benches/[id]/reviews GET error:", err);
    return jsonError("Unable to load reviews", "internal_error", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? body.user_id ?? DEFAULT_USER_ID).trim() || DEFAULT_USER_ID;
    const rating = Number(body.rating);
    const reviewBody = String(body.body ?? "").trim();
    const photoBase64Items = Array.isArray(body.photoBase64Items) ? body.photoBase64Items : [];

    if (rating < 0 || rating > 5) {
      return jsonError("Rating must be between 0 and 5", "validation_error", 422);
    }

    const reviewId = `review-${Date.now()}`;
    const supabase = createSupabaseServer();

    const { data: userRow } = await supabase.from("users").select("display_name").eq("id", userId).single();
    const author = userRow?.display_name || (userId === DEFAULT_USER_ID ? DEFAULT_AUTHOR : "community member");

    const { error } = await supabase.from("bench_reviews").insert({
      id: reviewId,
      bench_id: id,
      user_id: userId,
      rating,
      body: reviewBody,
      photo_base64_items: photoBase64Items
    });

    if (error) {
      return jsonError("Unable to create review", "internal_error", 500);
    }

    return jsonData(
      {
        id: reviewId,
        benchId: id,
        userId,
        author,
        rating,
        body: reviewBody,
        photoBase64Items,
        createdAt: new Date().toISOString()
      },
      201
    );
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
