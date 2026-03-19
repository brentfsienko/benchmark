import { NextResponse } from "next/server";
import { hasSupabase } from "@/src/lib/supabase";

export async function GET() {
  const hasDb = hasSupabase();
  return NextResponse.json({
    status: "ok",
    service: "benchmark-api",
    persistence: hasDb ? "supabase" : "none"
  });
}
