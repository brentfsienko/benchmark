import { createSupabaseAdmin } from "@/src/lib/supabase/admin";
import type { UserSummary } from "@/src/lib/types";

type UserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_photo_url: string | null;
};

export function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    username: String(row.username ?? ""),
    displayName: String(row.display_name ?? row.username ?? ""),
    avatarPhotoURL: String(row.avatar_photo_url ?? "")
  };
}

export async function fetchUserSummaries(ids: string[]): Promise<UserSummary[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_photo_url")
    .in("id", unique);
  if (error || !data) return [];

  const byId = new Map(data.map((u: UserRow) => [u.id, toUserSummary(u)]));
  return unique.map((id) => byId.get(id)).filter(Boolean) as UserSummary[];
}
