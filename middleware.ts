import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Public catalog APIs don't need session refresh — skip auth RTT.
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/api/v1/benches/pins") ||
    path.startsWith("/api/v1/benches/search")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    "";

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          response.cookies.set(name, value);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname === "/home" && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", "/home");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
