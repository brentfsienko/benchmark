/**
 * Smoke-test Resend from the CLI.
 *
 * 1. Put your real key in `.env.local`:
 *      RESEND_API_KEY=re_xxxxxxxxx   ← replace with your Resend API key
 * 2. Run: npm run email:test
 */
import { config } from "dotenv";
import { Resend } from "resend";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
if (!apiKey || apiKey.includes("xxxxxxxxx")) {
  console.error(
    "Set RESEND_API_KEY in .env.local to your real Resend key (replace re_xxxxxxxxx)."
  );
  process.exit(1);
}

const resend = new Resend(apiKey);
const to = (process.env.RESEND_TEST_TO ?? "brentfsienko@gmail.com").trim();
const from = (process.env.RESEND_FROM_EMAIL ?? "Benchmark <onboarding@resend.dev>").trim();

const { data, error } = await resend.emails.send({
  from,
  to,
  subject: "Hello from Benchmark",
  html: "<p>Congrats on sending your <strong>first email</strong> with Resend.</p>"
});

if (error) {
  console.error("Resend error:", error);
  process.exit(1);
}

console.log("Sent OK:", data);
