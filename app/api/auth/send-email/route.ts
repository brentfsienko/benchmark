import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import {
  authEmailSubject,
  buildAuthEmailHtml,
  buildAuthEmailText,
  parseHookSecret,
  resolveResendFrom,
  type AuthEmailData
} from "@/src/lib/auth-email";
import { getResendClient } from "@/src/lib/resend";

export const runtime = "nodejs";

type HookPayload = {
  user: {
    email?: string;
    new_email?: string;
  };
  email_data: AuthEmailData;
};

/**
 * Supabase Auth "Send Email" hook.
 * Configure in Dashboard → Authentication → Hooks → Send Email
 * URL: https://benchmark.rest/api/auth/send-email
 */
export async function POST(request: NextRequest) {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const hookSecret = parseHookSecret(process.env.SEND_EMAIL_HOOK_SECRET);

  if (!resendKey || !hookSecret) {
    console.error("send-email hook misconfigured: missing RESEND_API_KEY or SEND_EMAIL_HOOK_SECRET");
    return NextResponse.json(
      { error: { message: "Email hook is not configured", http_code: 500 } },
      { status: 500 }
    );
  }

  const payload = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  let verified: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    verified = wh.verify(payload, headers) as HookPayload;
  } catch (err) {
    console.error("send-email hook verify failed:", err);
    return NextResponse.json(
      { error: { message: "Invalid webhook signature", http_code: 401 } },
      { status: 401 }
    );
  }

  const to = verified.user.email?.trim();
  if (!to) {
    return NextResponse.json(
      { error: { message: "Missing recipient email", http_code: 400 } },
      { status: 400 }
    );
  }

  const emailData = verified.email_data;
  const resend = getResendClient();

  try {
    const { error } = await resend.emails.send({
      from: resolveResendFrom(),
      to: [to],
      subject: authEmailSubject(emailData.email_action_type),
      html: buildAuthEmailHtml(emailData, to),
      text: buildAuthEmailText(emailData, to)
    });
    if (error) {
      console.error("Resend send failed:", error);
      return NextResponse.json(
        { error: { message: error.message, http_code: 500 } },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Resend send threw:", err);
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Failed to send email",
          http_code: 500
        }
      },
      { status: 500 }
    );
  }

  return NextResponse.json({});
}
