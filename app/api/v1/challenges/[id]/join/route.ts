import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    await request.json().catch(() => ({}));
    const actor = await getRequestActor();
    const userId = actor?.profileId ?? "";
    if (!userId) return jsonError("Authentication required", "unauthorized", 401);

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
