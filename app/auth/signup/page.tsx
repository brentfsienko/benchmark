"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowser } from "@/src/lib/supabase/client";
import Link from "next/link";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const supabase = createSupabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim(), username: username.trim().toLowerCase() },
          emailRedirectTo: redirectTo
        }
      });
      if (error) {
        setStatus(error.message);
        return;
      }
      if (data.user?.identities?.length === 0) {
        setStatus("An account with this email already exists. Try signing in.");
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="screen">
      <div style={{ marginBottom: 24 }}>
        <BenchmarkLogo size={40} />
      </div>
      <h1 style={{ marginTop: 0 }}>create account</h1>
      <form onSubmit={onSubmit} className="surface-card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <label>
          display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="e.g. Alex"
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
        <label>
          username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="e.g. alexbench"
            pattern="[a-z0-9_]+"
            title="Lowercase letters, numbers, underscores only"
            style={{ width: "100%", marginTop: 6 }}
          />
          <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 4 }}>lowercase, no spaces</span>
        </label>
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
            minLength={6}
            autoComplete="new-password"
            style={{ width: "100%", marginTop: 6 }}
          />
          <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 4 }}>at least 6 characters</span>
        </label>
        <button type="submit" className="button-primary" disabled={loading}>
          {loading ? "creating…" : "sign up"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        already have an account? <Link href="/auth/login" style={{ color: "var(--accent)", fontWeight: 600 }}>sign in</Link>
      </p>
      {status ? <p style={{ color: "var(--danger)", marginTop: 12 }}>{status}</p> : null}
    </section>
  );
}
