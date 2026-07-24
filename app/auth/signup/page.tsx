"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/src/lib/supabase/client";
import Link from "next/link";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";
import { isReservedUsername } from "@/src/lib/admin";
import { safeRedirectPath } from "@/src/lib/safe-redirect";

function SignupForm() {
  const searchParams = useSearchParams();
  const next = useMemo(
    () => safeRedirectPath(searchParams.get("next"), "/"),
    [searchParams]
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const cleanUsername = username.trim().toLowerCase();
      if (isReservedUsername(cleanUsername)) {
        setStatus("That username is reserved.");
        return;
      }
      const supabase = createSupabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim(), username: cleanUsername },
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
      // Confirm-email enabled: no session until they click the link.
      if (!data.session) {
        setPendingVerifyEmail(email.trim());
        return;
      }
      window.location.href = next;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!pendingVerifyEmail) return;
    setResending(true);
    setResendStatus(null);
    try {
      const supabase = createSupabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerifyEmail,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) {
        setResendStatus(error.message);
        return;
      }
      setResendStatus("verification email sent again — check your inbox.");
    } catch (err) {
      setResendStatus(err instanceof Error ? err.message : "Could not resend email");
    } finally {
      setResending(false);
    }
  };

  if (pendingVerifyEmail) {
    return (
      <section className="screen">
        <div style={{ marginBottom: 24 }}>
          <BenchmarkLogo size={40} />
        </div>
        <h1 style={{ marginTop: 0 }}>check your email</h1>
        <div className="surface-card" style={{ padding: 20, display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            we sent a verification link to{" "}
            <strong style={{ wordBreak: "break-all" }}>{pendingVerifyEmail}</strong>.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            verify your email, then sign in to open challenges and track progress.
          </p>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              background: "var(--surface-soft, #f3eee6)",
              border: "1px solid var(--border)",
              fontSize: 13
            }}
          >
            tip: check spam if you don’t see it in a minute or two.
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={resending}
            onClick={() => void resendVerification()}
          >
            {resending ? "sending…" : "resend verification email"}
          </button>
          <Link
            href={`/auth/login?next=${encodeURIComponent(next)}`}
            className="button-primary"
            style={{ textAlign: "center" }}
          >
            go to sign in
          </Link>
        </div>
        {resendStatus ? (
          <p
            style={{
              color: resendStatus.includes("sent") ? "var(--accent)" : "var(--danger)",
              marginTop: 12,
              fontSize: 13
            }}
          >
            {resendStatus}
          </p>
        ) : null}
      </section>
    );
  }

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
        <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
          you’ll need to verify your email before signing in.
        </p>
        <button type="submit" className="button-primary" disabled={loading}>
          {loading ? "creating…" : "sign up"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        already have an account?{" "}
        <Link
          href={`/auth/login?next=${encodeURIComponent(next)}`}
          style={{ color: "var(--accent)", fontWeight: 600 }}
        >
          sign in
        </Link>
      </p>
      {status ? <p style={{ color: "var(--danger)", marginTop: 12 }}>{status}</p> : null}
    </section>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
