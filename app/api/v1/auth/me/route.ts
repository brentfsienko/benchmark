import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { isAdminEmail } from "@/src/lib/admin";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return jsonData({
      profileId: null,
      username: null,
      isAdmin: false,
      isAnonymous: true
    });
  }

  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("id, username")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const isAdmin = isAdminEmail(user.email);
  return jsonData({
    profileId: profile?.id ?? null,
    username: profile?.username ?? null,
    isAdmin,
    isAnonymous: false
  });
}
