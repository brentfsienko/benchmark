#!/usr/bin/env node
/**
 * Parse Benches-San_Francisco.geojson (OpenStreetMap export) into the shared
 * bench import format consumed by import-benches-to-db.js.
 *
 * On first run, fetches named POIs and street ways from Overpass and caches
 * them in ref/. Subsequent runs use the cached files (pass --force-fetch to
 * refresh them).
 *
 * Naming priority per bench:
 *   1. OSM name field on the bench itself
 *   2. Inscription text (truncated)
 *   3. Nearest named POI within 80 m (historic, tourism, natural, artwork…)
 *   4. Nearest named street within 60 m
 *   5. Containing park polygon
 *   6. Containing neighborhood polygon
 *   7. Fallback: "SF Bench #{osmId}"
 *
 * A cardinal direction suffix (· NE) is appended when the OSM direction
 * field is present and parseable (steps 3–6 only).
 *
 * After all names are assigned, benches sharing the exact same final name
 * are numbered sequentially (#1, #2…) sorted north→south then west→east.
 *
 * Usage:
 *   node scripts/bench-importer/import-sf-benches.js
 *   node scripts/bench-importer/import-sf-benches.js --force-fetch
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
const SUBAREAS_PATH = path.join(REF_DIR, "sf-subareas.json");
const POIS_PATH = path.join(REF_DIR, "sf-pois.json");
const STREETS_PATH = path.join(REF_DIR, "sf-streets.json");
const OUT_PATH = path.join(OUT_DIR, "benches-sf.json");

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SF_BBOX = "37.70,-122.52,37.84,-122.35";

const FORCE_FETCH = process.argv.includes("--force-fetch");

// Thresholds in degrees (at SF latitude: 1° lat ≈ 111 km, 1° lng ≈ 88 km)
const POI_THRESHOLD_DEG = 120 / 111_000;      // ~120 m (wider for parks with sparse landmarks)
const POI_THRESHOLD_STREET_DEG = 80 / 111_000; // ~80 m when not in a park
const STREET_THRESHOLD_DEG = 60 / 111_000;    // ~60 m

// ---------------------------------------------------------------------------
// Overpass fetching + caching
// ---------------------------------------------------------------------------

async function overpassQuery(query) {
  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  return resp.json();
}

async function loadOrFetch(refPath, label, fetchFn) {
  if (!FORCE_FETCH) {
    try {
      const raw = await fs.readFile(refPath, "utf-8");
      const data = JSON.parse(raw);
      console.log(`  Loaded ${label} from cache (${data.length} items)`);
      return data;
    } catch { /* fall through to fetch */ }
  }
  console.log(`  Fetching ${label} from Overpass…`);
  const data = await fetchFn();
  await fs.mkdir(REF_DIR, { recursive: true });
  await fs.writeFile(refPath, JSON.stringify(data));
  console.log(`  Saved ${data.length} ${label} to ${path.basename(refPath)}`);
  return data;
}

// Pre-fetch ref data (run once, then cached):
//   node scripts/bench-importer/fetch-sf-ref-data.js
// Or pass --force-fetch to refresh on next parse run.

async function fetchSFPOIs() {
  // Named historic, tourism, natural, and artwork nodes + way centers
  const query = `
[out:json][timeout:60];
(
  node["name"]["historic"](${SF_BBOX});
  node["name"]["tourism"](${SF_BBOX});
  node["name"]["natural"](${SF_BBOX});
  node["name"]["artwork_type"](${SF_BBOX});
  node["name"]["memorial"](${SF_BBOX});
  node["name"]["man_made"](${SF_BBOX});
  way["name"]["historic"](${SF_BBOX});
  way["name"]["natural"](${SF_BBOX});
  way["name"]["tourism"](${SF_BBOX});
  way["name"]["leisure"]["leisure"!="park"]["leisure"!="garden"](${SF_BBOX});
);
out center tags;`;
  const { elements } = await overpassQuery(query);
  const result = [];
  for (const el of elements) {
    const name = el.tags?.name?.trim();
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;
    result.push({ name, lat, lng });
  }
  return result;
}

async function fetchSFStreets() {
  const query = `
[out:json][timeout:90];
way["highway"]["name"](${SF_BBOX});
out center tags;`;
  const { elements } = await overpassQuery(query);
  const result = [];
  for (const el of elements) {
    const name = el.tags?.name?.trim();
    if (!name || !el.center) continue;
    result.push({ name, lat: el.center.lat, lng: el.center.lon });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Spatial grid index for O(1) approximate nearest-neighbor
// ---------------------------------------------------------------------------

const GRID_CELL = 0.005; // ~500 m cells

function buildGridIndex(points) {
  const grid = new Map();
  for (const p of points) {
    const key = `${Math.floor(p.lng / GRID_CELL)},${Math.floor(p.lat / GRID_CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  return grid;
}

function gridNearest(grid, lng, lat, threshold) {
  const cx = Math.floor(lng / GRID_CELL);
  const cy = Math.floor(lat / GRID_CELL);
  let best = null;
  let bestDist = threshold;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cx + dx},${cy + dy}`;
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (const p of bucket) {
        const d = Math.hypot(p.lng - lng, p.lat - lat);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function centroid(geometry) {
  const { type, coordinates } = geometry;
  if (type === "Point") return { lng: coordinates[0], lat: coordinates[1] };
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
    return {
      lng: pts.reduce((s, c) => s + c[0], 0) / pts.length,
      lat: pts.reduce((s, c) => s + c[1], 0) / pts.length,
    };
  }
  throw new Error(`Unsupported geometry type: ${type}`);
}

// ---------------------------------------------------------------------------
// Point-in-polygon
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

function buildRingLookup(items) {
  return (lng, lat) => {
    for (const item of items) {
      if (rayInPolygon(lng, lat, item.ring)) return item.name;
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
// Direction parsing
// ---------------------------------------------------------------------------

const CARDINAL_MAP = {
  n: "N", nne: "N", ne: "NE", ene: "E",
  e: "E", ese: "E", se: "SE", sse: "S",
  s: "S", ssw: "S", sw: "SW", wsw: "W",
  w: "W", wnw: "W", nw: "NW", nnw: "N",
  north: "N", east: "E", south: "S", west: "W",
};

function parseDirection(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.includes(";") || s.includes("-")) return null;
  const textMatch = CARDINAL_MAP[s.toLowerCase()];
  if (textMatch) return textMatch;
  const deg = parseFloat(s);
  if (!Number.isFinite(deg)) return null;
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return cardinals[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const MAX_INSCRIPTION_LEN = 60;

function deriveName(props, poi, subarea, street, parkName, neighborhood, osmId) {
  const direction = parseDirection(props.direction);
  const dir = direction ? ` · ${direction}` : "";

  // 1. OSM name on bench
  if (props.name?.trim()) return props.name.trim();

  // 2. Inscription
  if (props.inscription?.trim()) {
    const raw = props.inscription.trim();
    return raw.length > MAX_INSCRIPTION_LEN
      ? raw.slice(0, MAX_INSCRIPTION_LEN).trimEnd() + "…"
      : raw;
  }

  // 3. Named POI (landmark, historic site, natural feature, artwork)
  if (poi) return `${poi.name} bench${dir}`;

  // 4. Named sub-area polygon (Crissy Field, SF National Cemetery, Presidio Golf Course…)
  if (subarea) return `${subarea} bench${dir}`;

  // 5. Nearest street
  if (street) return `${street.name} bench${dir}`;

  // 6. Park polygon
  if (parkName) return `${parkName} bench${dir}`;

  // 7. Neighborhood polygon
  if (neighborhood) return `${neighborhood} bench${dir}`;

  // 7. Fallback
  return `SF Bench #${osmId}`;
}

// ---------------------------------------------------------------------------
// Duplicate numbering
// ---------------------------------------------------------------------------

function numberDuplicates(benches) {
  // Group by exact name
  const groups = new Map();
  for (const b of benches) {
    if (!groups.has(b.name)) groups.set(b.name, []);
    groups.get(b.name).push(b);
  }
  let numbered = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Sort N→S (lat desc), then W→E (lng asc) for consistent ordering
    group.sort((a, b) => b.latitude - a.latitude || a.longitude - b.longitude);
    for (let i = 0; i < group.length; i++) {
      group[i].name = `${group[i].name} #${i + 1}`;
    }
    numbered += group.length;
  }
  return numbered;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Loading reference data…");
  const [rawGeo, rawNbhd, rawParks, rawSubareas, pois, streets] = await Promise.all([
    fs.readFile(GEOJSON_PATH, "utf-8"),
    fs.readFile(NEIGHBORHOODS_PATH, "utf-8"),
    fs.readFile(PARKS_PATH, "utf-8"),
    fs.readFile(SUBAREAS_PATH, "utf-8"),
    loadOrFetch(POIS_PATH, "POIs", fetchSFPOIs),
    loadOrFetch(STREETS_PATH, "streets", fetchSFStreets),
  ]);

  const { features } = JSON.parse(rawGeo);
  const nbhdFeatures = JSON.parse(rawNbhd).features;
  const { parks } = JSON.parse(rawParks);
  const { areas: subareas } = JSON.parse(rawSubareas);

  const findPark = buildRingLookup(parks);
  const findSubarea = buildRingLookup(subareas);
  const findNeighborhood = buildNeighborhoodLookup(nbhdFeatures);
  const poiGrid = buildGridIndex(pois);
  const streetGrid = buildGridIndex(streets);

  console.log(
    `\nParsing ${features.length} benches against:` +
    ` ${pois.length} POIs, ${subareas.length} sub-areas, ${streets.length} streets,` +
    ` ${parks.length} parks, ${nbhdFeatures.length} neighborhoods`
  );

  const benches = [];
  let skipped = 0;
  const geomCounts = { Point: 0, LineString: 0, Polygon: 0 };
  const nameSourceCounts = { osm: 0, inscription: 0, poi: 0, subarea: 0, street: 0, park: 0, neighborhood: 0, fallback: 0 };

  for (const feature of features) {
    const props = feature.properties ?? {};
    const rawOsmId = String(props.id ?? props["@id"] ?? "");
    if (!rawOsmId) { skipped++; continue; }

    // Sanitize slashes so IDs are URL-safe
    const osmId = rawOsmId.replace(/\//g, "-");

    let coords;
    try { coords = centroid(feature.geometry); }
    catch { skipped++; continue; }

    geomCounts[feature.geometry.type] = (geomCounts[feature.geometry.type] ?? 0) + 1;

    const { lng, lat } = coords;

    const parkName = findPark(lng, lat);
    const subarea = findSubarea(lng, lat);
    const neighborhood = findNeighborhood(lng, lat);
    // Use wider POI radius inside parks (landmarks are more spread out)
    const poiThreshold = parkName ? POI_THRESHOLD_DEG : POI_THRESHOLD_STREET_DEG;
    const poi = gridNearest(poiGrid, lng, lat, poiThreshold);
    const street = gridNearest(streetGrid, lng, lat, STREET_THRESHOLD_DEG);

    // Track name source for stats
    if (props.name?.trim()) nameSourceCounts.osm++;
    else if (props.inscription?.trim()) nameSourceCounts.inscription++;
    else if (poi) nameSourceCounts.poi++;
    else if (subarea) nameSourceCounts.subarea++;
    else if (street) nameSourceCounts.street++;
    else if (parkName) nameSourceCounts.park++;
    else if (neighborhood) nameSourceCounts.neighborhood++;
    else nameSourceCounts.fallback++;

    const material = (props.material ?? "").trim() || null;
    const inscription = (props.inscription ?? "").trim() || null;
    const backrest = (props.backrest ?? "").trim() || null;

    const signals = { material, isPark: !!parkName, donorPlaque: inscription };
    const benchType = normalizeBenchType(signals);
    const facetTags = deriveFacetTags(signals);
    const baseTags = parkName ? ["sf-osm", "park"] : ["sf-osm"];

    benches.push({
      externalId: osmId,
      idPrefix: "bench-sf",
      sourceSystem: "OpenStreetMap — San Francisco",
      name: deriveName(props, poi, subarea, street, parkName, neighborhood, osmId),
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

  // Number benches that share the same name
  const numbered = numberDuplicates(benches);

  // Sanity check
  const sample = benches[0];
  if (sample) {
    const latOk = sample.latitude > 37.6 && sample.latitude < 37.95;
    const lngOk = sample.longitude > -122.55 && sample.longitude < -122.3;
    if (!latOk || !lngOk) {
      throw new Error(`Coordinates look wrong: lat=${sample.latitude}, lng=${sample.longitude}`);
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(benches, null, 2));

  console.log(`\nResults:`);
  console.log(`  Total output:        ${benches.length}`);
  console.log(`  Skipped:             ${skipped}`);
  console.log(`  Geometry:            ${JSON.stringify(geomCounts)}`);
  console.log(`  Name source:`);
  console.log(`    OSM name:          ${nameSourceCounts.osm}`);
  console.log(`    Inscription:       ${nameSourceCounts.inscription}`);
  console.log(`    Nearby POI:        ${nameSourceCounts.poi}`);
  console.log(`    Sub-area polygon:  ${nameSourceCounts.subarea}`);
  console.log(`    Nearest street:    ${nameSourceCounts.street}`);
  console.log(`    Park polygon:      ${nameSourceCounts.park}`);
  console.log(`    Neighborhood:      ${nameSourceCounts.neighborhood}`);
  console.log(`    Fallback:          ${nameSourceCounts.fallback}`);
  console.log(`  Numbered duplicates: ${numbered}`);
  console.log(`\nWrote ${benches.length} benches to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
