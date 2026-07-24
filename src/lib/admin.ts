/** Server-trusted admin emails. Do not use username for admin. */
export const ADMIN_EMAILS = [
  "brentfsienko@gmail.com",
  "walker.c.sutton@gmail.com",
] as const;

/** Usernames that must not be claimed (admin / brand / reserved). */
export const RESERVED_USERNAMES = [
  "brent",
  "admin",
  "administrator",
  "benchmark",
  "support",
  "official",
  "mod",
  "moderator",
] as const;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized as (typeof ADMIN_EMAILS)[number]);
}

export function isReservedUsername(username?: string | null): boolean {
  if (!username) return false;
  return RESERVED_USERNAMES.includes(
    username.trim().toLowerCase() as (typeof RESERVED_USERNAMES)[number]
  );
}
