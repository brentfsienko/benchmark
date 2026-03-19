import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

const DEFAULT_USER_ID = "user-1";

export async function POST(request: NextRequest) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const reporterUserId = String(body.reporterUserId ?? body.reporter_user_id ?? DEFAULT_USER_ID).trim() || DEFAULT_USER_ID;
    const targetType = String(body.targetType ?? body.target_type ?? "").trim();
    const targetId = String(body.targetId ?? body.target_id ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!targetType || !targetId || !reason) {
      return jsonError("targetType, targetId, and reason are required", "validation_error", 422);
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
