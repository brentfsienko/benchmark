"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { requestBenchCoverage } from "@/src/lib/api";
import { trackEvent } from "@/src/lib/analytics";

type RequestBenchesCtaProps = {
  latitude: number;
  longitude: number;
  defaultEmail?: string;
  visible: boolean;
  onDismiss: () => void;
};

export function RequestBenchesCta({
  latitude,
  longitude,
  defaultEmail = "",
  visible,
  onDismiss
}: RequestBenchesCtaProps) {
  const titleId = useId();
  const [modalOpen, setModalOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setContactEmail(defaultEmail);
  }, [defaultEmail]);

  useEffect(() => {
    if (!visible) {
      setModalOpen(false);
      setStatus(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const openModal = useCallback(() => {
    setStatus(null);
    setSent(false);
    setModalOpen(true);
    trackEvent({
      name: "bench_coverage_request_opened",
      metadata: { latitude, longitude }
    });
  }, [latitude, longitude]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setStatus(null);
      try {
        await requestBenchCoverage({
          locationLabel,
          contactEmail,
          message,
          latitude,
          longitude
        });
        setSent(true);
        setStatus("request sent — thanks for helping grow the map.");
        trackEvent({
          name: "bench_coverage_request_sent",
          metadata: { latitude, longitude, locationLabel }
        });
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "unable to send request");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, locationLabel, contactEmail, message, latitude, longitude]
  );

  if (!visible) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 72,
          bottom: "calc(var(--nav-height) + var(--safe-bottom) + 118px)",
          zIndex: 3,
          display: "flex",
          justifyContent: "flex-start",
          pointerEvents: "none"
        }}
      >
        <div
          className="surface-card"
          style={{
            pointerEvents: "auto",
            maxWidth: 320,
            width: "100%",
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            border: "1px solid var(--border)",
            background: "rgba(247,241,232,0.97)"
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 650, lineHeight: 1.3 }}>
              no benches here yet
            </p>
            <p className="muted" style={{ margin: "4px 0 10px", fontSize: 12, lineHeight: 1.35 }}>
              want this area on the map? tell us where to add benches.
            </p>
            <button
              type="button"
              className="button-primary"
              onClick={openModal}
              style={{ fontSize: 12, height: 32, padding: "0 12px" }}
            >
              request benches
            </button>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              background: "var(--elevated)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      </div>

      {modalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 320,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "0 0 max(12px, var(--safe-bottom))"
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="surface-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: "min(88dvh, 640px)",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: "var(--radius-lg, 16px)",
              borderTopRightRadius: "var(--radius-lg, 16px)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
              padding: "16px 20px 20px"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: "var(--border)",
                margin: "0 auto 14px"
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 id={titleId} style={{ margin: 0, fontSize: 18, textTransform: "lowercase" }}>
                request benches
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "var(--elevated)",
                  color: "var(--text-secondary)",
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.4 }}>
              we’ll email the team with this map spot
              ({latitude.toFixed(4)}, {longitude.toFixed(4)}) so they can prioritize adding benches.
            </p>

            {sent ? (
              <div style={{ marginTop: 18 }}>
                <p style={{ margin: 0, fontSize: 14, color: "var(--accent)" }}>{status}</p>
                <button
                  type="button"
                  className="button-secondary"
                  style={{ marginTop: 14, width: "100%" }}
                  onClick={() => {
                    setModalOpen(false);
                    onDismiss();
                  }}
                >
                  done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                  city / neighborhood
                  <input
                    value={locationLabel}
                    onChange={(e) => setLocationLabel(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="e.g. Capitol Hill, Seattle"
                    style={{ width: "100%" }}
                    autoComplete="address-level2"
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                  your email
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="you@email.com"
                    style={{ width: "100%" }}
                    autoComplete="email"
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                  anything else? <span className="muted">(optional)</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="favorite parks, trails, or spots to cover first…"
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </label>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={submitting}
                  style={{ width: "100%", opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? "sending…" : "send request"}
                </button>
                {status && !sent ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{status}</p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
