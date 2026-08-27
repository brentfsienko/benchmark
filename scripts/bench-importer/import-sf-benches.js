#!/usr/bin/env node
/**
 * Parse Benches-San_Francisco.geojson (OpenStreetMap export) into the shared
 * bench import format consumed by import-benches-to-db.js.
 *
 * No external API calls — neighborhood names are derived from a local
 * sf-neighborhoods.geojson polygon file (37 SF neighborhoods).
 *
 * Usage:
 *   node scripts/bench-importer/import-sf-benches.js
 *
 * Output:
 *   scripts/bench-importer/output/benches-sf.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBenchType, deriveFacetTags } from "./bench-type.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const REF_DIR = path.join(__dirname, "ref");
const OUT_DIR = path.join(__dirname, "output");

const GEOJSON_PATH = path.join(DATA_DIR, "benches-sf.geojson");
const NEIGHBORHOODS_PATH = path.join(REF_DIR, "sf-neighborhoods.geojson");
const OUT_PATH = path.join(OUT_DIR, "benches-sf.json");

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function centroid(geometry) {
  const { type, coordinates } = geometry;
  if (type === "Point") {
    return { lng: coordinates[0], lat: coordinates[1] };
  }
  if (type === "LineString") {
    // midpoint of first + last vertex
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    return { lng: (first[0] + last[0]) / 2, lat: (first[1] + last[1]) / 2 };
  }
  if (type === "Polygon") {
    // average of outer ring vertices (excluding closing duplicate)
    const ring = coordinates[0];
    const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
    const lng = pts.reduce((s, c) => s + c[0], 0) / pts.length;
    const lat = pts.reduce((s, c) => s + c[1], 0) / pts.length;
    return { lng, lat };
  }
  throw new Error(`Unsupported geometry type: ${type}`);
}

// ---------------------------------------------------------------------------
// Point-in-polygon (ray casting)
// ---------------------------------------------------------------------------

function rayInPolygon(lng, lat, ring) {
  let inside = false;
  const n = ring.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

function buildNeighborhoodLookup(nbhdFeatures) {
  return (lng, lat) => {
    for (const f of nbhdFeatures) {
      const { type, coordinates } = f.geometry;
      const rings = type === "Polygon" ? [coordinates[0]] : coordinates.map((p) => p[0]);
      for (const ring of rings) {
        if (rayInPolygon(lng, lat, ring)) return f.properties.name;
      }
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const MAX_INSCRIPTION_LEN = 60;

function deriveName(props, neighborhood, osmId) {
  // 1. OSM name field
  if (props.name && props.name.trim()) return props.name.trim();

  // 2. Inscription (truncated) — the bench has meaningful text
  if (props.inscription && props.inscription.trim()) {
    const raw = props.inscription.trim();
    const truncated = raw.length > MAX_INSCRIPTION_LEN
      ? raw.slice(0, MAX_INSCRIPTION_LEN).trimEnd() + "…"
      : raw;
    return truncated;
  }

  // 3. Neighborhood
  if (neighborhood) return `${neighborhood} bench`;

  // 4. Fallback
  return `SF Bench #${osmId}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [rawGeo, rawNbhd] = await Promise.all([
    fs.readFile(GEOJSON_PATH, "utf-8"),
    fs.readFile(NEIGHBORHOODS_PATH, "utf-8"),
  ]);

  const { features } = JSON.parse(rawGeo);
  const nbhdFeatures = JSON.parse(rawNbhd).features;
  const findNeighborhood = buildNeighborhoodLookup(nbhdFeatures);

  console.log(`Loaded ${features.length} features, ${nbhdFeatures.length} neighborhood polygons`);

  const benches = [];
  let skipped = 0;
  const geomCounts = { Point: 0, LineString: 0, Polygon: 0 };

  for (const feature of features) {
    const props = feature.properties ?? {};
    const osmId = String(props.id ?? props["@id"] ?? "");

    // Skip features without a usable ID
    if (!osmId) {
      skipped++;
      continue;
    }

    let coords;
    try {
      coords = centroid(feature.geometry);
    } catch {
      skipped++;
      continue;
    }

    geomCounts[feature.geometry.type] = (geomCounts[feature.geometry.type] ?? 0) + 1;

    const { lng, lat } = coords;
    const neighborhood = findNeighborhood(lng, lat);

    const material = (props.material ?? "").trim() || null;
    const inscription = (props.inscription ?? "").trim() || null;
    const backrest = (props.backrest ?? "").trim() || null;

    const signals = {
      material,
      isPark: false,
      donorPlaque: inscription, // treat inscriptions like donor plaques for "memorial" tag
    };
    const benchType = normalizeBenchType(signals);
    const facetTags = deriveFacetTags(signals);

    benches.push({
      externalId: osmId,
      idPrefix: "bench-sf",
      sourceSystem: "OpenStreetMap — San Francisco",
      name: deriveName(props, neighborhood, osmId),
      neighborhood: neighborhood ?? null,
      parkName: null,
      siteName: null,
      category: null,
      material,
      backrest,
      inscription,
      lengthFt: null,
      yearInstalled: null,
      donorPlaque: inscription,
      program: null,
      donorStatus: null,
      latitude: lat,
      longitude: lng,
      photos: [],
      tags: ["sf-osm", ...facetTags],
      isPark: false,
      benchType,
      source: { osmId, properties: props },
    });
  }

  // Sanity check: confirm coordinates are in SF bounding box
  const sample = benches[0];
  if (sample) {
    const latOk = sample.latitude > 37.6 && sample.latitude < 37.95;
    const lngOk = sample.longitude > -122.55 && sample.longitude < -122.3;
    if (!latOk || !lngOk) {
      throw new Error(
        `Coordinates look wrong for first bench: lat=${sample.latitude}, lng=${sample.longitude}`
      );
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(benches, null, 2));

  const withNeighborhood = benches.filter((b) => b.neighborhood).length;
  const withInscription = benches.filter((b) => b.inscription).length;
  const withName = benches.filter((b) => b.source.properties.name).length;

  console.log(`\nResults:`);
  console.log(`  Total output:       ${benches.length}`);
  console.log(`  Skipped:            ${skipped}`);
  console.log(`  Geometry breakdown: ${JSON.stringify(geomCounts)}`);
  console.log(`  Named (OSM name):   ${withName}`);
  console.log(`  Named (inscription):${withInscription}`);
  console.log(`  Named (neighborhood):${withNeighborhood}`);
  console.log(`\nWrote ${benches.length} benches to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
