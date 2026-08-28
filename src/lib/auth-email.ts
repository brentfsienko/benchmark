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
  signup: "almost there — confirm your benchmark email",
  invite: "you've been invited to benchmark",
  magiclink: "your benchmark sign-in link",
  recovery: "reset your benchmark password",
  email_change: "confirm your new email on benchmark",
  email_change_new: "confirm your new email on benchmark",
  reauthentication: "your benchmark verification code"
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
      title: "verification code",
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#605847;">
          here's your one-time code to verify your account:
        </p>
        <p style="margin:0 0 8px;font-size:32px;font-weight:700;letter-spacing:0.18em;color:#23201b;font-variant-numeric:tabular-nums;">
          ${escapeHtml(token)}
        </p>
        <p style="margin:8px 0 0;font-size:13px;color:#8a7a62;">
          expires shortly. don't share this with anyone.
        </p>
      `,
      cta: null,
      confirmationUrl: null
    });
  }

  const copy: Record<string, { title: string; body: string; cta: string }> = {
    signup: {
      title: "one last step",
      body: "tap below to confirm your email and claim your seat.",
      cta: "confirm email →"
    },
    invite: {
      title: "you're invited",
      body: "someone saved a seat for you on benchmark. tap below to create your account.",
      cta: "accept invite →"
    },
    magiclink: {
      title: "here's your link",
      body: "tap below to sign in. this link works once and expires soon — use it or lose it.",
      cta: "sign in →"
    },
    recovery: {
      title: "password reset",
      body: "someone (hopefully you) asked to reset your benchmark password. tap below to choose a new one.",
      cta: "reset password →"
    },
    email_change: {
      title: "confirm your new email",
      body: "tap below to confirm your updated email address on benchmark.",
      cta: "confirm email →"
    },
    email_change_new: {
      title: "confirm your new email",
      body: "tap below to confirm your updated email address on benchmark.",
      cta: "confirm email →"
    }
  };

  const content = copy[action] ?? {
    title: "benchmark",
    body: "tap the button below to continue.",
    cta: "continue →"
  };

  const blurb =
    action === "signup" || action === "invite"
      ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#7a6a52;">
           mark the benches you love, drop a benchmark, and take a seat with the rest of us.
         </p>`
      : "";

  return emailShell({
    title: content.title,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#605847;">
        ${escapeHtml(content.body)}
      </p>
      ${blurb}
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
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
        <tr>
          <td style="border-radius:6px;background:#23201b;">
            <a href="${escapeHtml(opts.confirmationUrl)}"
               style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:#f7f1e8;text-decoration:none;border-radius:6px;letter-spacing:0.03em;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;">
              ${escapeHtml(opts.cta)}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#9a8a72;">
        button not working?
        <a href="${escapeHtml(opts.confirmationUrl)}" style="color:#605847;text-decoration:underline;word-break:break-all;">${escapeHtml(opts.confirmationUrl)}</a>
      </p>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#efe8db;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#efe8db;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:500px;">

          <!-- wordmark -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img
                      src="https://benchmark.rest/app-icon.png"
                      width="32"
                      height="32"
                      alt=""
                      style="display:block;width:32px;height:32px;border-radius:7px;border:0;"
                    />
                  </td>
                  <td style="padding-left:9px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;font-weight:800;color:#23201b;letter-spacing:0.04em;text-transform:lowercase;vertical-align:middle;">
                    benchmark
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- card -->
          <tr>
            <td style="background:#f7f0e5;border:1px solid #d8cdb8;border-radius:12px;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:28px 28px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#23201b;">
                    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.025em;text-transform:lowercase;">
                      ${escapeHtml(opts.title)}
                    </h1>
                    ${opts.bodyHtml}
                    ${button}
                    <p style="margin:0 0 28px;font-size:12px;line-height:1.5;color:#9a8a72;">
                      didn't ask for this? you can safely ignore it — nothing will change.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 28px;border-top:1px solid #d8cdb8;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#9a8a72;">
                    benchmark · <a href="https://benchmark.rest" style="color:#605847;text-decoration:none;">benchmark.rest</a>
                  </td>
                </tr>
              </table>
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
    return `your benchmark verification code: ${emailData.token ?? ""}\n\nexpires shortly. don't share it.\n\n— benchmark (benchmark.rest)`;
  }
  const confirmationUrl = buildAuthConfirmationUrl(emailData);
  const actionLine =
    action === "recovery"
      ? "someone (hopefully you) asked to reset your benchmark password. open the link below to choose a new one."
      : action === "signup" || action === "invite"
      ? "tap the link below to confirm your email and claim your seat."
      : "open the link below to continue.";
  return `benchmark\n\n${actionLine}\n\n${confirmationUrl}\n\ndidn't ask for this? ignore this email — nothing will change.\n\n— benchmark (benchmark.rest)`;
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
