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
