import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { getRequestActor } from "@/src/lib/request-auth";

const ALLOWED_TARGET_TYPES = new Set(["bench", "review", "user"]);
const MAX_REASON_CHARS = 500;

export async function POST(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const actor = await getRequestActor();
    const reporterUserId = actor?.profileId ?? "";
    if (!reporterUserId) return jsonError("Authentication required", "unauthorized", 401);
    const targetType = String(body.targetType ?? body.target_type ?? "").trim();
    const targetId = String(body.targetId ?? body.target_id ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!targetType || !targetId || !reason) {
      return jsonError("targetType, targetId, and reason are required", "validation_error", 422);
    }
    if (!ALLOWED_TARGET_TYPES.has(targetType)) {
      return jsonError("Invalid targetType", "validation_error", 422);
    }
    if (targetId.length > 120) {
      return jsonError("targetId is too long", "validation_error", 422);
    }
    if (reason.length > MAX_REASON_CHARS) {
      return jsonError(`Reason must be ${MAX_REASON_CHARS} characters or fewer`, "validation_error", 422);
    }

    const id = `report-${Date.now()}`;
    const supabase = createSupabaseServer();

    const { error } = await supabase.from("content_reports").insert({
      id,
      reporter_user_id: reporterUserId,
      target_type: targetType,
      target_id: targetId,
      reason,
      status: "open"
    });

    if (error) return jsonError("Unable to create report", "internal_error", 500);
    return jsonData({ id }, 201);
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
