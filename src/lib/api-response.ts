import { NextResponse } from "next/server";

export function jsonData<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/** Like jsonData but sets Cache-Control for Vercel edge + browser caching. */
export function jsonCachedData<T>(data: T, sMaxAge = 60, staleWhileRevalidate = 300, status = 200) {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
      },
    },
  );
}

export function jsonDataMeta<T>(data: T, meta: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data, meta }, { status });
}

export function jsonError(message: string, code: string, status: number) {
  return NextResponse.json(
    { error: { message, code } },
    { status }
  );
}
