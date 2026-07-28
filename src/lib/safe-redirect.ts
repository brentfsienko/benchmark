/**
 * Allow only same-origin relative paths for post-login redirects.
 * Blocks https://, //, @, backslash, and control characters.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\") || trimmed.includes("@")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;
  return trimmed;
}

/** Canonical production origin for auth email / OAuth redirects. */
export const PRODUCTION_SITE_URL = "https://benchmark.rest";

/**
 * Origin used for Supabase emailRedirectTo.
 * Prefer NEXT_PUBLIC_SITE_URL, else production on non-localhost, else current origin.
 */
export function getAuthRedirectOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return origin;
  }
  return PRODUCTION_SITE_URL;
}
