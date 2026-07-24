import { isReservedUsername } from "@/src/lib/admin";
import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor, requireSelfOrAdmin } from "@/src/lib/request-auth";
import type { UserProfile } from "@/src/lib/types";

function buildProfile(
  user: Record<string, unknown>,
  benchmarked: string[],
  wishlist: string[],
  benchmarkCount: number,
  options?: { includePrivateFields?: boolean; includeAvatarBase64?: boolean }
): UserProfile {
  const includePrivateFields = options?.includePrivateFields ?? true;
  const includeAvatarBase64 = options?.includeAvatarBase64 ?? true;
  return {
    id: String(user.id),
    displayName: String(user.display_name),
    username: String(user.username),
    bio: String(user.bio ?? ""),
    isPublic: Boolean(user.is_public_profile ?? true),
    avatarSymbol: String(user.avatar_symbol || "person.crop.circle.fill"),
    avatarPhotoURL: String(user.avatar_photo_url ?? ""),
    avatarPhotoBase64: includeAvatarBase64 ? String(user.avatar_photo_base64 ?? "") : "",
    benchmarkCount,
    benchmarkedBenchIDs: includePrivateFields ? benchmarked : [],
    wishlistBenchIDs: includePrivateFields ? wishlist : []
  };
}

async function loadBenchmarkedAndWishlist(supabase: ReturnType<typeof createSupabaseServer>, id: string) {
  const [reviewsRes, wishlistRes] = await Promise.all([
    supabase.from("bench_reviews").select("bench_id").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("wishlist_items").select("bench_id").eq("user_id", id).order("created_at", { ascending: false })
  ]);
  const benchmarked = [...new Set((reviewsRes.data ?? []).map((r: { bench_id: string }) => r.bench_id))];
  const benchmarkCount = (reviewsRes.data ?? []).length;
  const wishlist = (wishlistRes.data ?? []).map((r: { bench_id: string }) => r.bench_id);
  return { benchmarked, wishlist, benchmarkCount };
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
    const slim = request.nextUrl.searchParams.get("slim") === "1";
    const actor = await getRequestActor();
    const supabase = createSupabaseServer();

    const userQuery = slim
      ? supabase
          .from("users")
          .select("id, display_name, username, bio, is_public_profile, avatar_symbol, avatar_photo_url")
          .eq("id", id)
          .single()
      : supabase
          .from("users")
          .select("id, display_name, username, bio, is_public_profile, avatar_symbol, avatar_photo_url, avatar_photo_base64")
          .eq("id", id)
          .single();

    const { data: user, error } = await userQuery;

    if (error || !user) {
      return jsonError("User not found", "user_not_found", 404);
    }

    const viewerIsSelfOrAdmin = Boolean(actor?.profileId) && requireSelfOrAdmin(actor!, id);
    const isPublic = Boolean(user.is_public_profile ?? true);
    if (!isPublic && !viewerIsSelfOrAdmin) {
      return jsonError("Profile is private", "forbidden", 403);
    }

    const { benchmarked, wishlist, benchmarkCount } = await loadBenchmarkedAndWishlist(supabase, id);
    return jsonData(
      buildProfile(user as Record<string, unknown>, benchmarked, wishlist, benchmarkCount, {
        includePrivateFields: viewerIsSelfOrAdmin,
        includeAvatarBase64: viewerIsSelfOrAdmin && !slim
      })
    );
  } catch (err) {
    return jsonError("Unable to load profile", "internal_error", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const actor = await getRequestActor();
    if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
    if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);

    const body = await request.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};
    if (body.displayName !== undefined) {
      const v = String(body.displayName).trim();
      if (v === "") return jsonError("Display name cannot be empty", "validation_error", 422);
      updates.display_name = v;
    }
    if (body.bio !== undefined) {
      const v = String(body.bio).trim();
      if (v.length > 280) return jsonError("Bio must be 280 characters or fewer", "validation_error", 422);
      updates.bio = v;
    }
    if (body.username !== undefined) {
      const v = String(body.username).trim().toLowerCase();
      if (!/^[a-z0-9_]+$/.test(v)) return jsonError("Username: lowercase letters, numbers, underscores only", "validation_error", 422);
      if (v.length < 2) return jsonError("Username must be at least 2 characters", "validation_error", 422);
      if (isReservedUsername(v)) return jsonError("Username is reserved", "validation_error", 422);
      updates.username = v;
    }
    if (body.isPublic !== undefined) updates.is_public_profile = Boolean(body.isPublic);
    if (body.avatarSymbol !== undefined) updates.avatar_symbol = String(body.avatarSymbol).trim();
    if (body.avatarPhotoURL !== undefined) updates.avatar_photo_url = String(body.avatarPhotoURL).trim();
    if (body.avatarPhotoBase64 !== undefined) {
      const v = String(body.avatarPhotoBase64);
      if (v.length > 2_000_000) return jsonError("Avatar photo payload is too large", "validation_error", 422);
      updates.avatar_photo_base64 = v;
    }

    const supabase = createSupabaseServer();

    if (typeof updates.username === "string") {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("username", updates.username)
        .neq("id", id)
        .maybeSingle();
      if (existing) {
        return jsonError("Username is already taken", "validation_error", 409);
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("users").update(updates).eq("id", id);
      if (error) {
        const message = (error.message || "").toLowerCase();
        if (message.includes("users_username_key") || message.includes("duplicate key")) {
          return jsonError("Username is already taken", "validation_error", 409);
        }
        return jsonError("Unable to update profile", "internal_error", 500);
      }
    }

    const { data: user } = await supabase
      .from("users")
      .select("id, display_name, username, bio, is_public_profile, avatar_symbol, avatar_photo_url, avatar_photo_base64")
      .eq("id", id)
      .single();

    if (!user) return jsonError("User not found", "user_not_found", 404);

    const { benchmarked, wishlist, benchmarkCount } = await loadBenchmarkedAndWishlist(supabase, id);
    return jsonData(buildProfile(user, benchmarked, wishlist, benchmarkCount));
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
