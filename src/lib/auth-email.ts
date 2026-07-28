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

function supabaseAuthBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return raw || "https://ygpwlmfdhshobeotuzad.supabase.co";
}

export function buildAuthConfirmationUrl(emailData: AuthEmailData): string {
  const params = new URLSearchParams({
    token: emailData.token_hash ?? "",
    type: String(emailData.email_action_type ?? "signup"),
    redirect_to: emailData.redirect_to || DEFAULT_SITE_URL
  });
  return `${supabaseAuthBaseUrl()}/auth/v1/verify?${params.toString()}`;
}

export function authEmailSubject(actionType: AuthEmailActionType): string {
  return SUBJECTS[actionType] ?? "Benchmark notification";
}

export function buildAuthEmailHtml(emailData: AuthEmailData, toEmail: string): string {
  const action = emailData.email_action_type;
  const confirmationUrl = buildAuthConfirmationUrl(emailData);
  const token = emailData.token ?? "";

  if (action === "reauthentication") {
    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #1a1a1a;">
        <h2 style="margin: 0 0 12px;">Your verification code</h2>
        <p style="margin: 0 0 16px;">Use this code to verify your Benchmark account:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.12em; margin: 0 0 16px;">${escapeHtml(token)}</p>
        <p style="margin: 0; color: #666; font-size: 13px;">If you did not request this, you can ignore this email.</p>
      </div>
    `;
  }

  const copy: Record<string, { title: string; body: string; cta: string }> = {
    signup: {
      title: "Confirm your email",
      body: "Follow the link below to confirm your email and finish signing up for Benchmark.",
      cta: "Confirm email"
    },
    invite: {
      title: "You're invited",
      body: "You've been invited to Benchmark. Follow the link below to create your account.",
      cta: "Accept invite"
    },
    magiclink: {
      title: "Sign in to Benchmark",
      body: "Follow the link below to sign in. This link expires shortly and can only be used once.",
      cta: "Sign in"
    },
    recovery: {
      title: "Reset your password",
      body: "We received a request to reset your Benchmark password. Follow the link below to choose a new one.",
      cta: "Reset password"
    },
    email_change: {
      title: "Confirm your new email",
      body: `Follow the link below to confirm the email change for ${toEmail}.`,
      cta: "Confirm new email"
    },
    email_change_new: {
      title: "Confirm your new email",
      body: `Follow the link below to confirm the email change for ${toEmail}.`,
      cta: "Confirm new email"
    }
  };

  const content = copy[action] ?? {
    title: "Benchmark",
    body: "Follow the link below to continue.",
    cta: "Continue"
  };

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 520px;">
      <h2 style="margin: 0 0 12px;">${escapeHtml(content.title)}</h2>
      <p style="margin: 0 0 16px;">${escapeHtml(content.body)}</p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(confirmationUrl)}"
           style="display: inline-block; background: #e4572e; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600;">
          ${escapeHtml(content.cta)}
        </a>
      </p>
      <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Or paste this URL into your browser:</p>
      <p style="margin: 0 0 16px; word-break: break-all; font-size: 12px; color: #444;">${escapeHtml(confirmationUrl)}</p>
      <p style="margin: 0; color: #666; font-size: 13px;">If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

export function buildAuthEmailText(emailData: AuthEmailData, toEmail: string): string {
  const action = emailData.email_action_type;
  if (action === "reauthentication") {
    return `Your Benchmark verification code is ${emailData.token ?? ""}.`;
  }
  const confirmationUrl = buildAuthConfirmationUrl(emailData);
  return `Benchmark (${toEmail})\n\nOpen this link to continue:\n${confirmationUrl}\n`;
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
  // Resend onboarding sender works before domain verification.
  return "Benchmark <onboarding@resend.dev>";
}
