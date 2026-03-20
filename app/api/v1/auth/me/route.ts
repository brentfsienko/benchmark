import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return jsonData({ profileId: process.env.NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID ?? "user-1", isAnonymous: true });
  }

  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  return jsonData({ profileId: profile?.id ?? null, isAnonymous: false });
}
