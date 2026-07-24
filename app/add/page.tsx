"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createBench } from "@/src/lib/api";
import { trackEvent } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth-context";
import { SectionHeader } from "@/src/components/section-header";

const NEIGHBORHOODS = [
  "Green Lake",
  "Volunteer Park",
  "Capitol Hill",
  "Fremont",
  "Wallingford",
  "University District",
  "Ravenna",
  "Phinney Ridge",
  "Ballard",
  "Other"
];

const BENCH_TYPES = [
  { value: "park", label: "park (standard)" },
  { value: "wooden", label: "wooden" },
  { value: "stone", label: "stone" },
  { value: "modern", label: "modern" },
  { value: "memorial", label: "memorial" }
];

const defaultLat = 47.6798;
const defaultLng = -122.3288;

type Step = "form" | "confirm" | "done";

export default function AddBenchPage() {
  const { isAdmin, user } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("Green Lake");
  const [customNeighborhood, setCustomNeighborhood] = useState("");
  const [type, setType] = useState("park");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState(String(defaultLat));
  const [longitude, setLongitude] = useState(String(defaultLng));
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdName, setCreatedName] = useState("");

  const finalNeighborhood = neighborhood === "Other" ? customNeighborhood.trim() : neighborhood;

  if (!user) {
    return (
      <section className="screen">
        <SectionHeader title="add a bench" subtitle="sign in to add benches" />
        <div className="surface-card" style={{ padding: 20 }}>
          <p className="muted" style={{ margin: "0 0 12px" }}>you need to be signed in to add benches.</p>
          <Link href="/auth/login" className="button-primary" style={{ display: "inline-block" }}>sign in</Link>
        </div>
      </section>
    );
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!finalNeighborhood) {
      setStatus("please enter a neighborhood");
      return;
    }
    setStatus(null);
    setStep("confirm");
  };

  const onConfirm = async () => {
    if (!isAdmin) return;
    setSubmitting(true);
    try {
      const created = await createBench({
        name,
        neighborhood: finalNeighborhood,
        type,
        description,
        latitude: Number(latitude),
        longitude: Number(longitude),
        averageRating: 0,
        viewScore: 0,
        remotenessScore: 0,
        popularityScore: 0,
        tags: ["user-submitted"]
      });
      setCreatedName(created.name);
      setStep("done");
      trackEvent({ name: "bench_created", benchId: created.id });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to add bench");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  };

  const useCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(6));
          setLongitude(pos.coords.longitude.toFixed(6));
          setStatus("location updated");
          setTimeout(() => setStatus(null), 2000);
        },
        () => setStatus("could not get location")
      );
    } else {
      setStatus("geolocation not supported");
    }
  };

  const reset = () => {
    setName("");
    setDescription("");
    setStatus(null);
    setCreatedName("");
    setStep("form");
  };

  if (step === "done") {
    return (
      <section className="screen">
        <SectionHeader title="bench added" subtitle="nice work" />
        <div className="surface-card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{createdName}</h2>
          <p className="muted" style={{ margin: "0 0 20px" }}>
            your bench has been added to the map at {finalNeighborhood}.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/explore" className="button-primary" style={{ display: "inline-block" }}>
              view on map
            </Link>
            <button type="button" className="button-secondary" onClick={reset}>
              add another
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (step === "confirm") {
    return (
      <section className="screen">
        <SectionHeader title="confirm bench" subtitle="review the details before adding" />
        <div className="surface-card" style={{ padding: 20 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <span className="muted" style={{ fontSize: 12 }}>name</span>
              <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{name}</p>
            </div>
            <div>
              <span className="muted" style={{ fontSize: 12 }}>neighborhood</span>
              <p style={{ margin: "4px 0 0" }}>{finalNeighborhood}</p>
            </div>
            <div>
              <span className="muted" style={{ fontSize: 12 }}>type</span>
              <p style={{ margin: "4px 0 0" }}>{BENCH_TYPES.find((t) => t.value === type)?.label ?? type}</p>
            </div>
            {description && (
              <div>
                <span className="muted" style={{ fontSize: 12 }}>description</span>
                <p style={{ margin: "4px 0 0" }}>{description}</p>
              </div>
            )}
            <div>
              <span className="muted" style={{ fontSize: 12 }}>coordinates</span>
              <p style={{ margin: "4px 0 0" }}>{Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button
              type="button"
              className="button-primary"
              style={{ flex: 1, height: 48 }}
              disabled={submitting || !isAdmin}
              onClick={onConfirm}
              title={isAdmin ? undefined : "bench creation is currently limited"}
            >
              {submitting ? "adding…" : "confirm & add bench"}
            </button>
            <button
              type="button"
              className="button-secondary"
              style={{ height: 48 }}
              onClick={() => setStep("form")}
              disabled={submitting}
            >
              back
            </button>
          </div>
          {!isAdmin ? (
            <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
              bench creation is currently limited — you can review the flow, but adding is invite-only for now.
            </p>
          ) : null}
        </div>
        {status ? <p style={{ color: "var(--danger)", marginTop: 12 }}>{status}</p> : null}
      </section>
    );
  }

  return (
    <section className="screen">
      <SectionHeader
        title="add a bench"
        subtitle="share a new bench with the community. use the map on explore to pin the exact spot."
      />
      <form onSubmit={onFormSubmit} className="surface-card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <label>
          name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. North Beach View Bench"
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
        <label>
          neighborhood
          <select
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            required
            style={{ width: "100%", marginTop: 6 }}
          >
            {NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {neighborhood === "Other" && (
            <input
              value={customNeighborhood}
              onChange={(e) => setCustomNeighborhood(e.target.value)}
              placeholder="enter neighborhood"
              required
              style={{ width: "100%", marginTop: 6 }}
            />
          )}
        </label>
        <label>
          bench type
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ width: "100%", marginTop: 6 }}
          >
            {BENCH_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="what makes this bench special?"
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span>location</span>
            <button type="button" className="button-secondary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={useCurrentLocation}>
              use my location
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              latitude
              <input type="number" step={0.000001} value={latitude} onChange={(e) => setLatitude(e.target.value)} required style={{ width: "100%", marginTop: 4 }} />
            </label>
            <label>
              longitude
              <input type="number" step={0.000001} value={longitude} onChange={(e) => setLongitude(e.target.value)} required style={{ width: "100%", marginTop: 4 }} />
            </label>
          </div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
            tip: open explore and tap the map to place a bench exactly
          </p>
        </div>
        <button type="submit" className="button-primary" style={{ height: 48 }}>
          review bench
        </button>
      </form>
      {status ? <p style={{ color: "var(--accent)", marginTop: 12 }}>{status}</p> : null}
    </section>
  );
}
