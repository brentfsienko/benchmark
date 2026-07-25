import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";
import {
  BENCHMARK_GEOFENCE_METERS,
  distanceMeters,
  formatDistanceMeters,
  isWithinGeofence
} from "@/src/lib/geo";
import {
  MAX_PHOTO_BASE64_CHARS,
  MAX_PHOTOS_PER_REVIEW
} from "@/src/lib/photo-limits";
import type { BenchReview } from "@/src/lib/types";

const FALLBACK_AUTHOR = "community member";
const MAX_REVIEW_BODY_CHARS = 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const lite = request.nextUrl.searchParams.get("lite") === "1";
    const supabase = createSupabaseServer();

    const reviewQuery = lite
      ? supabase
          .from("bench_reviews")
          .select("id, bench_id, user_id, rating, body, created_at")
          .eq("bench_id", id)
          .order("created_at", { ascending: false })
          .limit(40)
      : supabase
          .from("bench_reviews")
          .select("id, bench_id, user_id, rating, body, photo_base64_items, created_at")
          .eq("bench_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

    const { data: reviewRows, error } = await reviewQuery;

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
      photoBase64Items: lite
        ? []
        : Array.isArray(r.photo_base64_items)
          ? r.photo_base64_items
          : [],
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
    const actor = await getRequestActor();
    const userId = actor?.profileId ?? "";
    if (!userId) return jsonError("Authentication required", "unauthorized", 401);
    const rating = Number(body.rating);
    const reviewBody = String(body.body ?? "").trim();
    const photoBase64ItemsRaw = Array.isArray(body.photoBase64Items) ? body.photoBase64Items : [];
    const photoBase64Items: string[] = photoBase64ItemsRaw.map((p: unknown) => String(p));
    const userLat = Number(body.latitude);
    const userLng = Number(body.longitude);

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return jsonError("Rating must be between 0 and 5", "validation_error", 422);
    }
    if (reviewBody.length > MAX_REVIEW_BODY_CHARS) {
      return jsonError(`Review must be ${MAX_REVIEW_BODY_CHARS} characters or fewer`, "validation_error", 422);
    }
    if (photoBase64Items.length > MAX_PHOTOS_PER_REVIEW) {
      return jsonError(`Maximum ${MAX_PHOTOS_PER_REVIEW} photos per review`, "validation_error", 422);
    }
    if (photoBase64Items.some((p) => p.length > MAX_PHOTO_BASE64_CHARS)) {
      return jsonError("One or more photos are too large", "validation_error", 422);
    }
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      return jsonError(
        `location is required — you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark`,
        "location_required",
        422
      );
    }
    if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
      return jsonError("invalid location coordinates", "validation_error", 422);
    }

    const supabase = createSupabaseServer();

    const { data: geomRows } = await supabase.rpc("get_bench_coords", { p_id: id });
    const geomRow = Array.isArray(geomRows) ? geomRows[0] : geomRows;
    const benchLat = Number(geomRow?.latitude);
    const benchLng = Number(geomRow?.longitude);
    if (!Number.isFinite(benchLat) || !Number.isFinite(benchLng)) {
      return jsonError("Bench location unavailable", "bench_not_found", 404);
    }

    const userPos = { latitude: userLat, longitude: userLng };
    const benchPos = { latitude: benchLat, longitude: benchLng };
    const distance = distanceMeters(userPos, benchPos);
    if (!isWithinGeofence(userPos, benchPos)) {
      return jsonError(
        `you must be within ${BENCHMARK_GEOFENCE_METERS}m of this bench to submit a benchmark (you're about ${formatDistanceMeters(distance)} away)`,
        "outside_geofence",
        403
      );
    }

    const reviewId = `review-${Date.now()}`;

    const { data: userRow } = await supabase.from("users").select("display_name").eq("id", userId).single();
    const author = userRow?.display_name || FALLBACK_AUTHOR;

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
