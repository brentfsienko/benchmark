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
    const note = String(body.note ?? "").trim();

    const visitId = `visit-${Date.now()}`;
    const supabase = createSupabaseServer();

    const { error } = await supabase.from("bench_visits").insert({
      id: visitId,
      bench_id: id,
      user_id: userId,
      note: note || "submitted benchmark"
    });

    if (error) {
      return jsonError("Unable to create visit", "internal_error", 500);
    }

    return jsonData(
      { id: visitId, benchId: id, userId, note: note || "submitted benchmark" },
      201
    );
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
