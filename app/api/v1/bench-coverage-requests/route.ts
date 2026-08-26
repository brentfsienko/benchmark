import { NextRequest } from "next/server";
import { jsonData, jsonError } from "@/src/lib/api-response";
import { getRequestActor } from "@/src/lib/request-auth";
import { getResendClient } from "@/src/lib/resend";
import { resolveResendFrom } from "@/src/lib/auth-email";

const MAX_LOCATION_CHARS = 120;
const MAX_MESSAGE_CHARS = 1000;
const MAX_EMAIL_CHARS = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveInbox(): string {
  return (
    process.env.BENCH_REQUEST_TO_EMAIL?.trim() ||
    process.env.RESEND_TEST_TO?.trim() ||
    "brentfsienko@gmail.com"
  );
}

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY?.trim()) {
    return jsonError("Email delivery is not configured", "internal_error", 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const actor = await getRequestActor();
    const locationLabel = String(body.locationLabel ?? body.location ?? "").trim();
    const message = String(body.message ?? "").trim();
    const contactEmail = String(body.contactEmail ?? body.email ?? "").trim().toLowerCase();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!locationLabel) {
      return jsonError("locationLabel is required", "validation_error", 422);
    }
    if (locationLabel.length > MAX_LOCATION_CHARS) {
      return jsonError(`locationLabel must be ${MAX_LOCATION_CHARS} characters or fewer`, "validation_error", 422);
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return jsonError(`message must be ${MAX_MESSAGE_CHARS} characters or fewer`, "validation_error", 422);
    }
    if (!contactEmail || !EMAIL_RE.test(contactEmail) || contactEmail.length > MAX_EMAIL_CHARS) {
      return jsonError("a valid contactEmail is required", "validation_error", 422);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return jsonError("latitude and longitude are required", "validation_error", 422);
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return jsonError("latitude/longitude out of range", "validation_error", 422);
    }

    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const profileId = actor?.profileId ?? "anonymous";
    const id = `coverage-${Date.now()}`;

    const text = [
      "New bench coverage request",
      "",
      `Location: ${locationLabel}`,
      `Coordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      `Map: ${mapsUrl}`,
      `Contact: ${contactEmail}`,
      `User: ${profileId}`,
      message ? `Message: ${message}` : null,
      "",
      `Request id: ${id}`
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #23201b;">
        <h2 style="margin: 0 0 12px;">New bench coverage request</h2>
        <p style="margin: 0 0 8px;"><strong>Location:</strong> ${escapeHtml(locationLabel)}</p>
        <p style="margin: 0 0 8px;"><strong>Coordinates:</strong> ${latitude.toFixed(5)}, ${longitude.toFixed(5)}</p>
        <p style="margin: 0 0 8px;"><a href="${mapsUrl}">Open in Google Maps</a></p>
        <p style="margin: 0 0 8px;"><strong>Contact:</strong> ${escapeHtml(contactEmail)}</p>
        <p style="margin: 0 0 8px;"><strong>User:</strong> ${escapeHtml(profileId)}</p>
        ${
          message
            ? `<p style="margin: 12px 0 0;"><strong>Message:</strong><br/>${escapeHtml(message).replaceAll("\n", "<br/>")}</p>`
            : ""
        }
        <p style="margin: 16px 0 0; color: #6b655c; font-size: 12px;">Request id: ${escapeHtml(id)}</p>
      </div>
    `;

    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: resolveResendFrom(),
      to: resolveInbox(),
      replyTo: contactEmail,
      subject: `Bench coverage request: ${locationLabel}`,
      text,
      html
    });

    if (error) {
      console.error("bench-coverage-request send failed:", error);
      return jsonError("Unable to send request email", "internal_error", 500);
    }

    return jsonData({ id, sent: true }, 201);
  } catch (err) {
    console.error("bench-coverage-request error:", err);
    return jsonError("Invalid payload", "invalid_payload", 400);
  }
}
