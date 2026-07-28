import { describe, expect, it } from "vitest";
import {
  authEmailSubject,
  buildAuthConfirmationUrl,
  mapActionToOtpType,
  parseHookSecret,
  resolveResendFrom
} from "./auth-email";

describe("auth-email helpers", () => {
  it("builds an app confirm URL with token_hash (not supabase verify)", () => {
    const url = buildAuthConfirmationUrl({
      token_hash: "abc123",
      email_action_type: "signup",
      redirect_to: "https://benchmark.rest/auth/callback?next=%2Fhome"
    });
    expect(url).toContain("https://benchmark.rest/auth/confirm?");
    expect(url).toContain("token_hash=abc123");
    expect(url).toContain("type=email");
    expect(url).toContain("next=%2Fhome");
    expect(url).not.toContain("supabase.co/auth/v1/verify");
  });

  it("maps signup action to email otp type", () => {
    expect(mapActionToOtpType("signup")).toBe("email");
    expect(mapActionToOtpType("recovery")).toBe("recovery");
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
