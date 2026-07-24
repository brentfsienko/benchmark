"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message") ?? "Something went wrong";

  return (
    <section className="screen">
      <div style={{ marginBottom: 24 }}>
        <BenchmarkLogo size={40} />
      </div>
      <h1 style={{ marginTop: 0 }}>auth error</h1>
      <p className="muted">{message}</p>
      <Link href="/auth/login" className="button-primary" style={{ marginTop: 16 }}>
        try again
      </Link>
    </section>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<section className="screen"><p className="muted">loading…</p></section>}>
      <AuthErrorContent />
    </Suspense>
  );
}
