import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import type { UserProfile } from "@/src/lib/types";

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

    const { data: user, error } = await supabase
      .from("users")
      .select("id, display_name, username, bio, is_public_profile, avatar_symbol, avatar_photo_url, avatar_photo_base64")
      .eq("id", id)
      .single();

    if (error || !user) {
      return jsonError("User not found", "user_not_found", 404);
    }

    const [visitedRes, ratedRes, wishlistRes] = await Promise.all([
      supabase.from("bench_visits").select("bench_id").eq("user_id", id).order("visited_at", { ascending: false }),
      supabase.from("bench_reviews").select("bench_id").eq("user_id", id).order("created_at", { ascending: false }),
      supabase.from("wishlist_items").select("bench_id").eq("user_id", id).order("created_at", { ascending: false })
    ]);

    const visited = [...new Map((visitedRes.data ?? []).map((r: { bench_id: string }) => [r.bench_id, r.bench_id])).values()];
    const rated = [...new Map((ratedRes.data ?? []).map((r: { bench_id: string }) => [r.bench_id, r.bench_id])).values()];
    const wishlist = (wishlistRes.data ?? []).map((r: { bench_id: string }) => r.bench_id);

    const profile: UserProfile = {
      id: user.id,
      displayName: user.display_name,
      username: user.username,
      bio: user.bio ?? "",
      isPublic: user.is_public_profile ?? true,
      avatarSymbol: user.avatar_symbol || "person.crop.circle.fill",
      avatarPhotoURL: user.avatar_photo_url ?? "",
      avatarPhotoBase64: user.avatar_photo_base64 ?? "",
      visitedBenchIDs: visited,
      ratedBenchIDs: rated,
      wishlistBenchIDs: wishlist
    };
    return jsonData(profile);
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

    if (Object.keys(updates).length === 0) {
      const supabase = createSupabaseServer();
      const { data: user } = await supabase.from("users").select("*").eq("id", id).single();
      if (!user) return jsonError("User not found", "user_not_found", 404);
      const [visitedRes, ratedRes, wishlistRes] = await Promise.all([
        supabase.from("bench_visits").select("bench_id").eq("user_id", id).order("visited_at", { ascending: false }),
        supabase.from("bench_reviews").select("bench_id").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("wishlist_items").select("bench_id").eq("user_id", id).order("created_at", { ascending: false })
      ]);
      const visited = [...new Map((visitedRes.data ?? []).map((r: { bench_id: string }) => [r.bench_id, r.bench_id])).values()];
      const rated = [...new Map((ratedRes.data ?? []).map((r: { bench_id: string }) => [r.bench_id, r.bench_id])).values()];
      const wishlist = (wishlistRes.data ?? []).map((r: { bench_id: string }) => r.bench_id);
      return jsonData({
        id: user.id,
        displayName: user.display_name,
        username: user.username,
        bio: user.bio ?? "",
        isPublic: user.is_public_profile ?? true,
        avatarSymbol: user.avatar_symbol || "person.crop.circle.fill",
        avatarPhotoURL: user.avatar_photo_url ?? "",
        avatarPhotoBase64: user.avatar_photo_base64 ?? "",
        visitedBenchIDs: visited,
        ratedBenchIDs: rated,
        wishlistBenchIDs: wishlist
      });
    }

    const supabase = createSupabaseServer();
    const { error } = await supabase.from("users").update(updates).eq("id", id);

    if (error) return jsonError("Unable to update profile", "internal_error", 500);

    const { data: user } = await supabase
      .from("users")
      .select("id, display_name, username, bio, is_public_profile, avatar_symbol, avatar_photo_url, avatar_photo_base64")
      .eq("id", id)
      .single();

    if (!user) return jsonError("User not found", "user_not_found", 404);

    const [visitedRes, ratedRes, wishlistRes] = await Promise.all([
      supabase.from("bench_visits").select("bench_id").eq("user_id", id).order("visited_at", { ascending: false }),
      supabase.from("bench_reviews").select("bench_id").eq("user_id", id).order("created_at", { ascending: false }),
      supabase.from("wishlist_items").select("bench_id").eq("user_id", id).order("created_at", { ascending: false })
    ]);

    const visited = [...new Map((visitedRes.data ?? []).map((r: { bench_id: string }) => [r.bench_id, r.bench_id])).values()];
    const rated = [...new Map((ratedRes.data ?? []).map((r: { bench_id: string }) => [r.bench_id, r.bench_id])).values()];
    const wishlist = (wishlistRes.data ?? []).map((r: { bench_id: string }) => r.bench_id);

    const profile: UserProfile = {
      id: user.id,
      displayName: user.display_name,
      username: user.username,
      bio: user.bio ?? "",
      isPublic: user.is_public_profile ?? true,
      avatarSymbol: user.avatar_symbol || "person.crop.circle.fill",
      avatarPhotoURL: user.avatar_photo_url ?? "",
      avatarPhotoBase64: user.avatar_photo_base64 ?? "",
      visitedBenchIDs: visited,
      ratedBenchIDs: rated,
      wishlistBenchIDs: wishlist
    };
    return jsonData(profile);
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
