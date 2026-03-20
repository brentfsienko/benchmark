import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor, requireSelfOrAdmin } from "@/src/lib/request-auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id } = await params;
    const actor = await getRequestActor();
    if (!actor?.profileId) return jsonError("Authentication required", "unauthorized", 401);
    if (!requireSelfOrAdmin(actor, id)) return jsonError("Forbidden", "forbidden", 403);

    const supabase = createSupabaseServer();

    const { error } = await supabase
      .from("users")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return jsonError("Unable to update onboarding", "internal_error", 500);
    }
    return jsonData({ onboardingComplete: true });
  } catch (err) {
    return jsonError("Unable to update onboarding", "internal_error", 500);
  }
}
