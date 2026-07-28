import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/src/lib/safe-redirect";

/**
 * Email confirmation / magic-link landing page.
 * Uses token_hash + verifyOtp so links work across devices (no PKCE cookie required).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/");

  const successUrl = new URL(next, request.url);
  const errorUrl = new URL("/auth/error", request.url);
  errorUrl.searchParams.set("message", "auth_callback_failed");

  if (!token_hash || !type) {
    return NextResponse.redirect(errorUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    "";

  let response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.redirect(successUrl);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    // Signup confirmations sometimes require type=signup instead of email.
    if (type === "email") {
      const retry = await supabase.auth.verifyOtp({ type: "signup", token_hash });
      if (!retry.error) return response;
      console.error("auth confirm verifyOtp failed:", error.message, retry.error.message);
    } else {
      console.error("auth confirm verifyOtp failed:", error.message);
    }
    return NextResponse.redirect(errorUrl);
  }

  return response;
}
