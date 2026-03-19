import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

const DEFAULT_USER_ID = "user-1";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? body.user_id ?? DEFAULT_USER_ID).trim() || DEFAULT_USER_ID;

    const supabase = createSupabaseServer();
    const { error } = await supabase.from("challenge_participants").upsert(
      {
        challenge_id: id,
        user_id: userId,
        progress_count: 0,
        points: 0,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "challenge_id,user_id", ignoreDuplicates: true }
    );

    if (error) return jsonError("Unable to join challenge", "internal_error", 500);
    return jsonData({ challengeId: id, userId }, 201);
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
