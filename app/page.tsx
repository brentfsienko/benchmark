"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ONBOARDING_KEY = "benchmark_onboarding_complete";

export default function RootPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const done = localStorage.getItem(ONBOARDING_KEY);
    router.replace(done ? "/explore" : "/onboarding");
  }, [mounted, router]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--page)"
      }}
    >
      <span className="muted">loading…</span>
    </div>
  );
}
