import { describe, expect, it } from "vitest";
import {
  authEmailSubject,
  buildAuthConfirmationUrl,
  parseHookSecret,
  resolveResendFrom
} from "./auth-email";

describe("auth-email helpers", () => {
  it("builds a supabase verify URL with redirect", () => {
    const url = buildAuthConfirmationUrl({
      token_hash: "abc123",
      email_action_type: "signup",
      redirect_to: "https://benchmark.rest/auth/callback"
    });
    expect(url).toContain("/auth/v1/verify?");
    expect(url).toContain("token=abc123");
    expect(url).toContain("type=signup");
    expect(url).toContain(encodeURIComponent("https://benchmark.rest/auth/callback"));
  });

  it("maps subjects for known actions", () => {
    expect(authEmailSubject("signup")).toMatch(/confirm/i);
    expect(authEmailSubject("recovery")).toMatch(/password/i);
  });

  it("strips v1,whsec_ prefix from hook secrets", () => {
    expect(parseHookSecret("v1,whsec_deadbeef")).toBe("deadbeef");
    expect(parseHookSecret("plainsecret")).toBe("plainsecret");
  });

  it("falls back to resend onboarding from-address", () => {
    const prev = process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    expect(resolveResendFrom()).toContain("onboarding@resend.dev");
    if (prev === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = prev;
  });
});
