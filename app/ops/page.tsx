"use client";

import { FormEvent, useEffect, useState } from "react";
import { createContentReport, getFeatureFlag, readReady, upsertFeatureFlag } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth-context";
import { SectionHeader } from "@/src/components/section-header";

export default function OpsPage() {
  const { profileId } = useAuth();
  const [ready, setReady] = useState("unknown");
  const [flag, setFlag] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [targetID, setTargetID] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    readReady()
      .then((row) => setReady(row.status))
      .catch(() => setReady("down"));
    getFeatureFlag("challenge_engine_enabled")
      .then((row) => setFlag(row.isEnabled))
      .catch(() => setFlag(false));
  }, []);

  const onReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await createContentReport({
        reporterUserId: profileId ?? "user-1",
        targetType: "bench",
        targetId: targetID,
        reason
      });
      setStatus(`report created: ${result.id}`);
      setTargetID("");
      setReason("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to create report");
    }
  };

  return (
    <section className="screen">
      <SectionHeader title="ops" subtitle="launch readiness and moderation controls" />
      <div className="surface-card" style={{ padding: 14, marginBottom: 12 }}>
        <p style={{ margin: 0 }}>readiness: {ready}</p>
        <p className="muted" style={{ marginBottom: 0 }}>
          challenge engine flag: {flag ? "enabled" : "disabled"}
        </p>
        <button
          className="button-secondary"
          style={{ marginTop: 10 }}
          onClick={() =>
            upsertFeatureFlag("challenge_engine_enabled", !flag)
              .then((row) => setFlag(row.isEnabled))
              .catch((err: Error) => setStatus(err.message))
          }
        >
          toggle challenge engine
        </button>
      </div>

      <form onSubmit={onReport} className="surface-card" style={{ padding: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>submit moderation report</h2>
        <label>
          target bench id
          <input value={targetID} onChange={(e) => setTargetID(e.target.value)} required style={{ width: "100%", marginTop: 4 }} />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          reason
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} style={{ width: "100%", marginTop: 4 }} />
        </label>
        <button className="button-primary" style={{ marginTop: 10 }} type="submit">
          report content
        </button>
      </form>
      {status ? <p style={{ color: "var(--accent)" }}>{status}</p> : null}
    </section>
  );
}
