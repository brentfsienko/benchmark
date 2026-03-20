import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";
import { isRequestAdmin } from "@/src/lib/admin-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!hasSupabase()) {
    return jsonData({ flagKey: key, isEnabled: false });
  }
  try {
    const supabase = createSupabaseServer();

    const { data, error } = await supabase
      .from("runtime_feature_flags")
      .select("flag_key, is_enabled")
      .eq("flag_key", key)
      .single();

    if (error || !data) {
      return jsonData({ flagKey: key, isEnabled: false });
    }
    return jsonData({ flagKey: data.flag_key, isEnabled: data.is_enabled });
  } catch (err) {
    return jsonData({ flagKey: key, isEnabled: false });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  if (!(await isRequestAdmin())) {
    return jsonError("Admin access required", "forbidden", 403);
  }
  try {
    const { key } = await params;
    const body = await request.json().catch(() => ({}));
    const isEnabled = Boolean(body.isEnabled ?? body.is_enabled);

    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from("runtime_feature_flags")
      .upsert({ flag_key: key, is_enabled: isEnabled, updated_at: new Date().toISOString() }, { onConflict: "flag_key" })
      .select("flag_key, is_enabled")
      .single();

    if (error) return jsonError("Unable to update feature flag", "internal_error", 500);
    return jsonData({ flagKey: data.flag_key, isEnabled: data.is_enabled });
  } catch (err) {
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
