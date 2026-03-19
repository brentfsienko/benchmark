import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { createSupabaseServer, hasSupabase } from "@/src/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; benchId: string }> }
) {
  if (!hasSupabase()) {
    return jsonError("Database not configured", "internal_error", 503);
  }
  try {
    const { id, benchId } = await params;
    const supabase = createSupabaseServer();

    const { error } = await supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", id)
      .eq("bench_id", benchId);

    if (error) return jsonError("Unable to remove wishlist item", "internal_error", 500);
    return jsonData({ benchId });
  } catch (err) {
    return jsonError("Unable to remove wishlist item", "internal_error", 500);
  }
}
