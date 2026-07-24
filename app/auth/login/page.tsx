"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/src/lib/supabase/client";
import Link from "next/link";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";
import { safeRedirectPath } from "@/src/lib/safe-redirect";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = useMemo(
    () => safeRedirectPath(searchParams.get("next"), "/"),
    [searchParams]
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("confirm")) {
          setStatus(
            "verify your email first — check your inbox for the confirmation link, then try again."
          );
        } else {
          setStatus(error.message);
        }
        return;
      }
      window.location.href = next;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="screen">
      <div style={{ marginBottom: 24 }}>
        <BenchmarkLogo size={40} />
      </div>
      <h1 style={{ marginTop: 0 }}>sign in</h1>
      <form onSubmit={onSubmit} className="surface-card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <label>
          email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
        <label>
          password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
        <button type="submit" className="button-primary" disabled={loading}>
          {loading ? "signing in…" : "sign in"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        no account? <Link href="/auth/signup" style={{ color: "var(--accent)", fontWeight: 600 }}>sign up</Link>
      </p>
      {status ? <p style={{ color: "var(--danger)", marginTop: 12 }}>{status}</p> : null}
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
