import type { EmailOtpType } from "@supabase/supabase-js";

export type AuthEmailActionType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email_change_new"
  | "reauthentication"
  | string;

export type AuthEmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type: AuthEmailActionType;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
  new_email?: string;
};

const DEFAULT_SITE_URL = "https://benchmark.rest";

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your Benchmark email",
  invite: "You're invited to Benchmark",
  magiclink: "Your Benchmark sign-in link",
  recovery: "Reset your Benchmark password",
  email_change: "Confirm your new Benchmark email",
  email_change_new: "Confirm your new Benchmark email",
  reauthentication: "Your Benchmark verification code"
};

/** Map Supabase hook action → verifyOtp type (SSR-safe token_hash flow). */
export function mapActionToOtpType(action: AuthEmailActionType): EmailOtpType {
  switch (action) {
    case "signup":
      // Official SSR templates use type=email for signup confirmation.
      return "email";
    case "invite":
      return "invite";
    case "magiclink":
      return "magiclink";
    case "recovery":
      return "recovery";
    case "email_change":
    case "email_change_new":
      return "email_change";
    case "email":
      return "email";
    default:
      return "email";
  }
}

function siteOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  return configured || DEFAULT_SITE_URL;
}

function nextPathFromRedirect(redirectTo: string | undefined): string {
  if (!redirectTo) return "/";
  try {
    const url = new URL(redirectTo);
    const next = url.searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    if (url.pathname.startsWith("/") && url.pathname !== "/auth/callback") return url.pathname;
  } catch {
    // ignore
  }
  return "/";
}

/**
 * App-hosted confirm URL using token_hash (works across devices/browsers).
 * Avoids PKCE /auth/v1/verify links that fail when email is opened elsewhere.
 */
export function buildAuthConfirmationUrl(emailData: AuthEmailData): string {
  const params = new URLSearchParams({
    token_hash: emailData.token_hash ?? "",
    type: mapActionToOtpType(emailData.email_action_type),
    next: nextPathFromRedirect(emailData.redirect_to)
  });
  return `${siteOrigin()}/auth/confirm?${params.toString()}`;
}

export function authEmailSubject(actionType: AuthEmailActionType): string {
  return SUBJECTS[actionType] ?? "Benchmark notification";
}

export function buildAuthEmailHtml(emailData: AuthEmailData, _toEmail: string): string {
  const action = emailData.email_action_type;
  const confirmationUrl = buildAuthConfirmationUrl(emailData);
  const token = emailData.token ?? "";

  if (action === "reauthentication") {
    return emailShell({
      title: "Your verification code",
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#605847;">
          Use this code to verify your Benchmark account:
        </p>
        <p style="margin:0 0 8px;font-size:28px;font-weight:700;letter-spacing:0.14em;color:#23201b;">
          ${escapeHtml(token)}
        </p>
      `,
      cta: null,
      confirmationUrl: null
    });
  }

  const copy: Record<string, { title: string; body: string; cta: string }> = {
    signup: {
      title: "Confirm your email",
      body: "Tap the button below to confirm your email and finish signing up for Benchmark.",
      cta: "Confirm email"
    },
    invite: {
      title: "You're invited",
      body: "You've been invited to Benchmark. Tap below to create your account.",
      cta: "Accept invite"
    },
    magiclink: {
      title: "Sign in to Benchmark",
      body: "Tap below to sign in. This link expires shortly and can only be used once.",
      cta: "Sign in"
    },
    recovery: {
      title: "Reset your password",
      body: "We received a request to reset your Benchmark password. Tap below to choose a new one.",
      cta: "Reset password"
    },
    email_change: {
      title: "Confirm your new email",
      body: "Tap below to confirm your new email address for Benchmark.",
      cta: "Confirm new email"
    },
    email_change_new: {
      title: "Confirm your new email",
      body: "Tap below to confirm your new email address for Benchmark.",
      cta: "Confirm new email"
    }
  };

  const content = copy[action] ?? {
    title: "Benchmark",
    body: "Tap the button below to continue.",
    cta: "Continue"
  };

  return emailShell({
    title: content.title,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#605847;">
        ${escapeHtml(content.body)}
      </p>
    `,
    cta: content.cta,
    confirmationUrl
  });
}

function emailShell(opts: {
  title: string;
  bodyHtml: string;
  cta: string | null;
  confirmationUrl: string | null;
}): string {
  const button =
    opts.cta && opts.confirmationUrl
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:10px;background:#2d6a4f;">
            <a href="${escapeHtml(opts.confirmationUrl)}"
               style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#f6f5f1;text-decoration:none;border-radius:10px;">
              ${escapeHtml(opts.cta)}
            </a>
          </td>
        </tr>
      </table>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5efe4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5efe4;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#f7f1e8;border:1px solid #dacfbf;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:22px 24px 8px;background:#efe5d6;border-bottom:1px solid #dacfbf;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:28px;height:28px;border-radius:8px;background:#2d6a4f;color:#f7f1e8;font-size:14px;font-weight:700;text-align:center;vertical-align:middle;line-height:28px;">b</td>
                  <td style="padding-left:10px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;font-size:18px;font-weight:700;color:#23201b;letter-spacing:-0.02em;">benchmark</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#23201b;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;">
                ${escapeHtml(opts.title)}
              </h1>
              ${opts.bodyHtml}
              ${button}
              <p style="margin:0;font-size:12px;line-height:1.45;color:#605847;">
                If you did not request this, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 18px;border-top:1px solid #dacfbf;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#605847;">
              Benchmark · <a href="https://benchmark.rest" style="color:#2d6a4f;text-decoration:none;">benchmark.rest</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAuthEmailText(emailData: AuthEmailData, _toEmail: string): string {
  const action = emailData.email_action_type;
  if (action === "reauthentication") {
    return `Your Benchmark verification code is ${emailData.token ?? ""}.\n\n— Benchmark`;
  }
  const confirmationUrl = buildAuthConfirmationUrl(emailData);
  return `Confirm your Benchmark email\n\nOpen this button-equivalent link to continue:\n${confirmationUrl}\n\nIf you did not request this, ignore this email.\n\n— Benchmark (benchmark.rest)\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseHookSecret(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  return value.replace(/^v1,whsec_/, "");
}

export function resolveResendFrom(): string {
  const from = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (from) return from;
  return "Benchmark <onboarding@resend.dev>";
}
