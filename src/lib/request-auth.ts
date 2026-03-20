import { createSupabaseAdmin } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { isAdminEmail, isAdminUsername } from "@/src/lib/admin";

export type RequestActor = {
  authUserId: string;
  email: string | null;
  profileId: string | null;
  username: string | null;
  isAdmin: boolean;
};

export async function getRequestActor(): Promise<RequestActor | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("id, username")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const email = user.email ?? null;
  const username = profile?.username ?? null;

  return {
    authUserId: user.id,
    email,
    profileId: profile?.id ?? null,
    username,
    isAdmin: isAdminEmail(email) || isAdminUsername(username)
  };
}

export function requireSelfOrAdmin(actor: RequestActor, targetProfileId: string): boolean {
  return actor.isAdmin || actor.profileId === targetProfileId;
}
