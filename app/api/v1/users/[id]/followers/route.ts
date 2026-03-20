import { NextRequest } from "next/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) return jsonError("Database not configured", "internal_error", 503);
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_follows")
    .select("follower_id")
    .eq("following_id", id);
  if (error) return jsonError("Unable to load followers", "internal_error", 500);
  const ids = (data ?? []).map((r: { follower_id: string }) => r.follower_id);
  return jsonData(ids);
}
