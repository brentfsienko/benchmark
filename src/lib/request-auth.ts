import { createSupabaseAdmin } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { isAdminEmail } from "@/src/lib/admin";

export type RequestActor = {
  authUserId: string;
  email: string | null;
  profileId: string | null;
  username: string | null;
  isAdmin: boolean;
};

export async function getRequestActor(): Promise<RequestActor | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("id, username")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const email = user.email ?? null;

  return {
    authUserId: user.id,
    email,
    profileId: profile?.id ?? null,
    username: profile?.username ?? null,
    isAdmin: isAdminEmail(email),
  };
}

export function requireSelfOrAdmin(actor: RequestActor, targetProfileId: string): boolean {
  return actor.isAdmin || actor.profileId === targetProfileId;
}

/** Whether the actor may view private fields for a profile. */
export async function canViewUserPrivateData(
  actor: RequestActor | null,
  targetProfileId: string,
  isPublicProfile: boolean
): Promise<boolean> {
  if (actor && requireSelfOrAdmin(actor, targetProfileId)) return true;
  return isPublicProfile;
}
