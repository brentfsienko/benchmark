#!/usr/bin/env node
/**
 * Parse Benches-San_Francisco.geojson (OpenStreetMap export) into the shared
 * bench import format consumed by import-benches-to-db.js.
 *
 * No external API calls — names are derived from two local reference files:
 *   ref/sf-parks.json       — 503 named SF park polygons (OSM)
 *   ref/sf-neighborhoods.geojson — 37 SF neighborhood polygons
 *
 * Naming priority:
 *   1. OSM name field
 *   2. Inscription text (truncated)
 *   3. Park name  (point-in-polygon against sf-parks.json)
 *   4. Neighborhood name (point-in-polygon against sf-neighborhoods.geojson)
 *   5. Fallback: "SF Bench #<osmId>"
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
const PARKS_PATH = path.join(REF_DIR, "sf-parks.json");
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
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    return { lng: (first[0] + last[0]) / 2, lat: (first[1] + last[1]) / 2 };
  }
  if (type === "Polygon") {
    const ring = coordinates[0];
    const pts =
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
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

function buildParkLookup(parks) {
  return (lng, lat) => {
    for (const p of parks) {
      if (rayInPolygon(lng, lat, p.ring)) return p.name;
    }
    return null;
  };
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

// Map 16-point compass abbreviations → 8-point
const CARDINAL_16_TO_8 = {
  n: "N", nne: "N", ne: "NE", ene: "E",
  e: "E", ese: "E", se: "SE", sse: "S",
  s: "S", ssw: "S", sw: "SW", wsw: "W",
  w: "W", wnw: "W", nw: "NW", nnw: "N",
  north: "N", east: "E", south: "S", west: "W",
};

/**
 * Parse an OSM `direction` value to a short 8-point cardinal string, or null.
 * Handles numeric degrees ("171"), cardinal text ("NNE", "north"), and skips
 * ambiguous or multi-value strings ("0-360", "NE;SE").
 */
function parseDirection(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Skip obviously ambiguous values
  if (s.includes(";") || s.includes("-")) return null;

  // Try text lookup first (case-insensitive)
  const textMatch = CARDINAL_16_TO_8[s.toLowerCase()];
  if (textMatch) return textMatch;

  // Try numeric degrees
  const deg = parseFloat(s);
  if (!Number.isFinite(deg)) return null;
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return cardinals[idx];
}

function deriveName(props, parkName, neighborhood, osmId) {
  // 1. OSM name field
  if (props.name && props.name.trim()) return props.name.trim();

  // 2. Inscription — bench has meaningful commemorative text (no direction suffix)
  if (props.inscription && props.inscription.trim()) {
    const raw = props.inscription.trim();
    return raw.length > MAX_INSCRIPTION_LEN
      ? raw.slice(0, MAX_INSCRIPTION_LEN).trimEnd() + "…"
      : raw;
  }

  const direction = parseDirection(props.direction);
  const dirSuffix = direction ? ` · ${direction}` : "";

  // 3. Park name (most specific location context)
  if (parkName) return `${parkName} bench${dirSuffix}`;

  // 4. Neighborhood
  if (neighborhood) return `${neighborhood} bench${dirSuffix}`;

  // 5. Fallback
  return `SF Bench #${osmId}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [rawGeo, rawNbhd, rawParks] = await Promise.all([
    fs.readFile(GEOJSON_PATH, "utf-8"),
    fs.readFile(NEIGHBORHOODS_PATH, "utf-8"),
    fs.readFile(PARKS_PATH, "utf-8"),
  ]);

  const { features } = JSON.parse(rawGeo);
  const nbhdFeatures = JSON.parse(rawNbhd).features;
  const { parks } = JSON.parse(rawParks);

  const findPark = buildParkLookup(parks);
  const findNeighborhood = buildNeighborhoodLookup(nbhdFeatures);

  console.log(
    `Loaded ${features.length} features, ${parks.length} park polygons, ${nbhdFeatures.length} neighborhood polygons`
  );

  const benches = [];
  let skipped = 0;
  const geomCounts = { Point: 0, LineString: 0, Polygon: 0 };
  const nameSourceCounts = { osm: 0, inscription: 0, park: 0, neighborhood: 0, fallback: 0 };

  for (const feature of features) {
    const props = feature.properties ?? {};
    const rawOsmId = String(props.id ?? props["@id"] ?? "");

    if (!rawOsmId) {
      skipped++;
      continue;
    }

    // Sanitize: OSM IDs like "node/12345" contain slashes that break URL routing.
    const osmId = rawOsmId.replace(/\//g, "-");

    let coords;
    try {
      coords = centroid(feature.geometry);
    } catch {
      skipped++;
      continue;
    }

    geomCounts[feature.geometry.type] = (geomCounts[feature.geometry.type] ?? 0) + 1;

    const { lng, lat } = coords;
    const parkName = findPark(lng, lat);
    const neighborhood = findNeighborhood(lng, lat);

    const material = (props.material ?? "").trim() || null;
    const inscription = (props.inscription ?? "").trim() || null;
    const backrest = (props.backrest ?? "").trim() || null;

    // Track name source for stats
    if (props.name?.trim()) nameSourceCounts.osm++;
    else if (inscription) nameSourceCounts.inscription++;
    else if (parkName) nameSourceCounts.park++;
    else if (neighborhood) nameSourceCounts.neighborhood++;
    else nameSourceCounts.fallback++;

    const signals = {
      material,
      isPark: !!parkName,
      donorPlaque: inscription,
    };
    const benchType = normalizeBenchType(signals);
    const facetTags = deriveFacetTags(signals);
    const baseTags = parkName ? ["sf-osm", "park"] : ["sf-osm"];

    benches.push({
      externalId: osmId,
      idPrefix: "bench-sf",
      sourceSystem: "OpenStreetMap — San Francisco",
      name: deriveName(props, parkName, neighborhood, osmId),
      neighborhood: neighborhood ?? null,
      parkName: parkName ?? null,
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
      tags: [...new Set([...baseTags, ...facetTags])],
      isPark: !!parkName,
      benchType,
      source: { osmId, properties: props },
    });
  }

  // Sanity check
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

  console.log(`\nResults:`);
  console.log(`  Total output:        ${benches.length}`);
  console.log(`  Skipped:             ${skipped}`);
  console.log(`  Geometry breakdown:  ${JSON.stringify(geomCounts)}`);
  console.log(`  Name source:`);
  console.log(`    OSM name:          ${nameSourceCounts.osm}`);
  console.log(`    Inscription:       ${nameSourceCounts.inscription}`);
  console.log(`    Park name:         ${nameSourceCounts.park}`);
  console.log(`    Neighborhood:      ${nameSourceCounts.neighborhood}`);
  console.log(`    Fallback:          ${nameSourceCounts.fallback}`);
  console.log(`\nWrote ${benches.length} benches to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
