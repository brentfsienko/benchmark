import { createSupabaseAdmin, hasSupabase } from "./supabase/admin";

/** @deprecated Use createSupabaseAdmin from supabase/admin */
export const createSupabaseServer = createSupabaseAdmin;
export { hasSupabase };
