import { NextRequest } from "next/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { canViewUserPrivateData, getRequestActor } from "@/src/lib/request-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id } = await params;
  const actor = await getRequestActor();
  const supabase = createSupabaseAdmin();

  const { data: user } = await supabase
    .from("users")
    .select("id, is_public_profile")
    .eq("id", id)
    .maybeSingle();
  if (!user) return jsonError("User not found", "user_not_found", 404);

  const allowed = await canViewUserPrivateData(
    actor,
    id,
    Boolean(user.is_public_profile ?? true)
  );
  if (!allowed) return jsonError("Forbidden", "forbidden", 403);

  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", id);
  if (error) return jsonError("Unable to load following", "internal_error", 500);
  const ids = (data ?? []).map((r: { following_id: string }) => r.following_id);
  return jsonData(ids);
}
