import { NextResponse } from "next/server";

export function jsonData<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
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
