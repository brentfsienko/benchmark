import { createSupabaseAdmin } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { isAdminEmail, isAdminUsername } from "@/src/lib/admin";

export async function isRequestAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("username")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return isAdminUsername(profile?.username ?? null);
}
