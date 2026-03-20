export const ADMIN_EMAILS = ["brentfsienko@gmail.com"] as const;
export const ADMIN_USERNAMES = ["brent"] as const;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized as (typeof ADMIN_EMAILS)[number]);
}

export function isAdminUsername(username?: string | null): boolean {
  if (!username) return false;
  const normalized = username.trim().toLowerCase();
  return ADMIN_USERNAMES.includes(normalized as (typeof ADMIN_USERNAMES)[number]);
}
