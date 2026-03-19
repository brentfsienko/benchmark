"use client";

import { FormEvent, useState } from "react";
import { createBench } from "@/src/lib/api";
import { trackEvent } from "@/src/lib/analytics";
import { SectionHeader } from "@/src/components/section-header";

const defaultLat = 47.6298;
const defaultLng = -122.3142;

export default function AddBenchPage() {
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("volunteer park");
  const [type, setType] = useState("park");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState(String(defaultLat));
  const [longitude, setLongitude] = useState(String(defaultLng));
  const [status, setStatus] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const created = await createBench({
        name,
        neighborhood,
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

  return (
    <section className="screen">
      <SectionHeader title="add a bench" subtitle="set the exact pin coordinates for the new bench." />
      <form onSubmit={onSubmit} className="surface-card" style={{ padding: 14, display: "grid", gap: 8 }}>
        <label>
          name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", marginTop: 4 }} />
        </label>
        <label>
          neighborhood
          <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} required style={{ width: "100%", marginTop: 4 }} />
        </label>
        <label>
          type
          <input value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
        </label>
        <label>
          description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: "100%", marginTop: 4 }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
        <button type="submit" className="button-primary">
          confirm bench
        </button>
      </form>
      {status ? <p style={{ color: "var(--accent)" }}>{status}</p> : null}
    </section>
  );
}
