"use client";

import { FormEvent, useState } from "react";
import { createBench } from "@/src/lib/api";
import { trackEvent } from "@/src/lib/analytics";
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

export default function AddBenchPage() {
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("Green Lake");
  const [customNeighborhood, setCustomNeighborhood] = useState("");
  const [type, setType] = useState("park");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState(String(defaultLat));
  const [longitude, setLongitude] = useState(String(defaultLng));
  const [status, setStatus] = useState<string | null>(null);

  const finalNeighborhood = neighborhood === "Other" ? customNeighborhood.trim() : neighborhood;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!finalNeighborhood) {
      setStatus("please enter a neighborhood");
      return;
    }
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
      setStatus(`created ${created.name}`);
      setName("");
      setDescription("");
      trackEvent({ name: "bench_created", benchId: created.id });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "unable to add bench");
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

  return (
    <section className="screen">
      <SectionHeader
        title="add a bench"
        subtitle="share a new bench with the community. use the map on explore to pin the exact spot."
      />
      <form onSubmit={onSubmit} className="surface-card" style={{ padding: 20, display: "grid", gap: 16 }}>
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
            style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
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
            style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
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
              <input
                type="number"
                step={0.000001}
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label>
              longitude
              <input
                type="number"
                step={0.000001}
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          </div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
            tip: open explore and tap the map to place a bench exactly
          </p>
        </div>
        <button type="submit" className="button-primary" style={{ height: 48 }}>
          add bench
        </button>
      </form>
      {status ? <p style={{ color: "var(--accent)", marginTop: 12 }}>{status}</p> : null}
    </section>
  );
}
