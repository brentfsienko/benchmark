#!/usr/bin/env node
/**
 * Rename Seattle import benches with location-aware flair.
 *
 * Strategy:
 * - Hard 20m radius for named OSM features (art, buildings, gardens, water,
 *   streets, streams) and curated park landmarks — never invent POIs
 * - Prefer what you can actually see from the seat
 * - Fall back to park + direction + setting words (lawn / shore / canopy…),
 *   not bland "mid stretch" filler
 * - Only append #N when benches sit in a tight proximity cluster (~12m)
 *
 * Usage:
 *   npm run import:benches:rename -- --dry-run --park=Volunteer
 *   npm run import:benches:rename -- --dry-run --limit=60
 *   npm run import:benches:rename
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
loadEnv({ path: path.join(ROOT, ".env.local") });

const SOURCE_SYSTEM = "Seattle Parks & Recreation (DPR) GIS — Park Bench";
const BENCHES_PATH = path.join(ROOT, "scripts", "bench-importer", "output", "benches-seattle.json");
const OUT_PATH = path.join(ROOT, "scripts", "bench-importer", "output", "benches-renamed.json");
const OSM_CACHE_PATH = path.join(ROOT, "scripts", "bench-importer", "output", "osm-nearby-cache.json");

const EARTH_M = 6_371_000;
/** Max pairwise distance for a numbered collection (complete-linkage). */
const CLUSTER_METERS = 12;
/** Hard cap: named features must be this close to name a bench. */
const FEATURE_METERS = 20;

const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

/**
 * Hand-tuned landmarks — all radii capped at FEATURE_METERS.
 * Only used when OSM has no better named feature within 20m.
 */
const PARK_LANDMARKS = {
  "Green Lake": [
    { lat: 47.6762, lng: -122.3345, r: 20, label: "South Duck Pond" },
    { lat: 47.6848, lng: -122.3370, r: 20, label: "North Beach" }
  ],
  "Alki Beach Park": [
    { lat: 47.5768, lng: -122.4188, r: 20, label: "Alki Point" },
    { lat: 47.5805, lng: -122.4075, r: 20, label: "Statue of Liberty" },
    { lat: 47.5915, lng: -122.3935, r: 20, label: "Don Armeni Boat Ramp" }
  ],
  "Lincoln Park": [
    { lat: 47.5295, lng: -122.3995, r: 20, label: "Colman Pool" },
    { lat: 47.5275, lng: -122.3965, r: 20, label: "South Beach Stairs" },
    { lat: 47.5362, lng: -122.3962, r: 20, label: "North Entrance" }
  ],
  "Cal Anderson Park": [
    { lat: 47.6173, lng: -122.3193, r: 20, label: "Reflecting Pool" },
    { lat: 47.6182, lng: -122.3190, r: 20, label: "Shelter House" },
    { lat: 47.6156, lng: -122.3188, r: 20, label: "Pine Street Corner" },
    { lat: 47.6178, lng: -122.3196, r: 20, label: "Broadway Terrace" }
  ],
  "Green Lake Park": [
    { lat: 47.6762, lng: -122.3345, r: 20, label: "South Duck Pond" },
    { lat: 47.6828, lng: -122.3348, r: 20, label: "Bathhouse Theater" },
    { lat: 47.6848, lng: -122.3370, r: 20, label: "North Beach" },
    { lat: 47.6780, lng: -122.3385, r: 20, label: "Community Center" },
    { lat: 47.6805, lng: -122.3425, r: 20, label: "West Shore" }
  ],
  "Warren G. Magnuson Park": [
    { lat: 47.6805, lng: -122.2518, r: 20, label: "Promontory Point" },
    { lat: 47.6828, lng: -122.2485, r: 20, label: "Boat Launch" },
    { lat: 47.6775, lng: -122.2555, r: 20, label: "Wetland Trails" }
  ],
  "Washington Park and Arboretum": [
    { lat: 47.6398, lng: -122.2945, r: 20, label: "Japanese Garden" },
    { lat: 47.6392, lng: -122.2968, r: 20, label: "Azalea Way" },
    { lat: 47.6435, lng: -122.2935, r: 20, label: "Foster Island" },
    { lat: 47.6375, lng: -122.2985, r: 20, label: "Graham Visitors Center" }
  ],
  "Seward Park": [
    { lat: 47.5555, lng: -122.2505, r: 20, label: "Peninsula Tip" },
    { lat: 47.5508, lng: -122.2528, r: 20, label: "South Beach" },
    { lat: 47.5588, lng: -122.2535, r: 20, label: "Andrews Bay" }
  ],
  "Golden Gardens Park": [
    { lat: 47.6918, lng: -122.4035, r: 20, label: "North Beach Fire Pits" },
    { lat: 47.6885, lng: -122.4028, r: 20, label: "Bathhouse" },
    { lat: 47.6935, lng: -122.4022, r: 20, label: "Sand Spit" }
  ],
  "Volunteer Park": [
    { lat: 47.6302, lng: -122.3148, r: 20, label: "Conservatory" },
    { lat: 47.6315, lng: -122.3155, r: 20, label: "Water Tower" },
    { lat: 47.6295, lng: -122.3135, r: 20, label: "Asian Art Museum" },
    { lat: 47.6288, lng: -122.3158, r: 20, label: "Amphitheater" },
    { lat: 47.6308, lng: -122.3165, r: 20, label: "Dahlia Garden" },
    { lat: 47.6308, lng: -122.3142, r: 20, label: "Black Sun" },
    { lat: 47.6299, lng: -122.3168, r: 20, label: "Reservoir" }
  ],
  "Lake Union Park": [
    { lat: 47.6275, lng: -122.3378, r: 20, label: "Center for Wooden Boats" },
    { lat: 47.6288, lng: -122.3395, r: 20, label: "MOHAI" }
  ],
  "Kerry Park and Viewpoint": [{ lat: 47.6295, lng: -122.3598, r: 20, label: "Skyline Overlook" }],
  "Gas Works Park": [
    { lat: 47.6458, lng: -122.3355, r: 20, label: "Kite Hill" },
    { lat: 47.6452, lng: -122.3368, r: 20, label: "Exhauster Building" },
    { lat: 47.6465, lng: -122.3342, r: 20, label: "Lake Union Shore" }
  ],
  "Discovery Park": [
    { lat: 47.6615, lng: -122.4185, r: 20, label: "West Point Lighthouse" },
    { lat: 47.6578, lng: -122.4255, r: 20, label: "South Beach" },
    { lat: 47.66, lng: -122.41, r: 20, label: "Parade Ground" }
  ],
  "Myrtle Edwards Park": [{ lat: 47.6185, lng: -122.3605, r: 20, label: "Sculpture Park Edge" }],
  "Carkeek Park": [
    { lat: 47.7125, lng: -122.3775, r: 20, label: "Piper's Creek" },
    { lat: 47.7118, lng: -122.3815, r: 20, label: "Railroad Bridge Beach" }
  ],
  "Victor Steinbrueck Park": [
    { lat: 47.6095, lng: -122.3425, r: 20, label: "Pike Place Overlook" },
    { lat: 47.6098, lng: -122.3432, r: 20, label: "Elliott Bay Totems" }
  ]
};

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_OSM = process.argv.includes("--skip-osm");
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;
const PARK_FILTER = argValue("--park");

function toRad(d) {
  return (d * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(from, to) {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function cardinal(bearing) {
  const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return dirs[Math.round(bearing / 45) % 8];
}

function shortPark(name) {
  if (!name) return "Seattle";
  return name
    .replace(/\s+and\s+Arboretum$/i, " Arboretum")
    .replace(/\s+Park$/i, "")
    .replace(/\s+Playfield$/i, " Playfield")
    .replace(/\s+Boulevard$/i, " Blvd")
    .replace(/\s+and Viewpoint$/i, "")
    .replace(/\s+Viewpoint$/i, "")
    .replace(/\s+Boat Ramp$/i, "")
    .replace(/^Warren G\.\s+/i, "")
    .trim();
}

function titleCaseWords(s) {
  return s
    .split(/\s+/)
    .map((w) => {
      if (/^(of|to|at|in|on|by|and)$/i.test(w)) return w.toLowerCase();
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function settingFromText(...parts) {
  const blob = parts.filter(Boolean).join(" ").toLowerCase();
  if (/beach|shore|waterfront|lakefront|harbor|marina|bay|sound/.test(blob)) return "shore";
  if (/pond|duck|fountain|waterfall|creek|river|canal|wetland|marsh|reservoir/.test(blob))
    return "waterside";
  if (/garden|arboretum|rose|dahlia|conservatory|botanic|azalea/.test(blob)) return "garden";
  if (/viewpoint|overlook|vista|skyline|bluff|promontory/.test(blob)) return "overlook";
  if (/trail|path|boulevard|promenade|loop|corridor/.test(blob)) return "trail";
  if (/grove|wood|forest|meadow|lawn|fir/.test(blob)) return "grove";
  if (/pier|dock|ramp|boat|marina/.test(blob)) return "pier";
  if (/playfield|sports|ballfield/.test(blob)) return "playfield";
  return "lawn";
}

function settingNoun(setting) {
  switch (setting) {
    case "shore":
      return "Shore";
    case "waterside":
      return "Waterside";
    case "garden":
      return "Garden Edge";
    case "overlook":
      return "Overlook";
    case "trail":
      return "Trail";
    case "grove":
      return "Canopy";
    case "pier":
      return "Pier";
    case "playfield":
      return "Playfield";
    default:
      return "Lawn";
  }
}

function nearestLandmark(bench, parkName) {
  const list = PARK_LANDMARKS[parkName] || PARK_LANDMARKS[bench.parkName] || [];
  let best = null;
  for (const lm of list) {
    const d = distanceMeters(
      { lat: bench.latitude, lng: bench.longitude },
      { lat: lm.lat, lng: lm.lng }
    );
    if (d > Math.min(lm.r, FEATURE_METERS)) continue;
    if (!best || d < best.distance) best = { label: lm.label, distance: d, kind: "landmark" };
  }
  return best;
}

function siteQualifier(bench, park) {
  const site = (bench.siteName || "").trim();
  if (!site) return null;
  if (site.toLowerCase() === (park || "").toLowerCase()) return null;

  const short = shortPark(park);
  const paren = site.match(/\(([^)]+)\)\s*$/);
  if (paren) {
    const inner = paren[1].trim();
    if (inner.length >= 3 && inner.length <= 36 && !/^park$/i.test(inner)) return inner;
  }

  let q = site
    .replace(new RegExp(`^${(park || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(new RegExp(`^${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(park)?\\s*`, "i"), "")
    .replace(/^\(|\)$/g, "")
    .replace(/^[-–—]\s*/, "")
    .trim();
  if (q.length < 3 || q.length > 36) return null;
  if (/^park$/i.test(q)) return null;
  if (/wood|metal|standard|approved|concrete|composite/i.test(q)) return null;
  const qLower = q.toLowerCase();
  if (qLower === short.toLowerCase() || qLower.includes(short.toLowerCase())) return null;
  return q;
}

function minDistToWay(bench, geometry) {
  let best = Infinity;
  for (const g of geometry) {
    const d = distanceMeters(bench, { lat: g.lat, lng: g.lon });
    if (d < best) best = d;
  }
  return best;
}

function featureKind(tags) {
  if (!tags) return "other";
  if (tags.tourism === "artwork" || tags.artwork_type || tags.historic) return "artwork";
  if (tags.tourism || tags.amenity === "arts_centre" || tags.amenity === "theatre") return "poi";
  if (tags.building) return "building";
  if (tags.leisure === "garden" || /garden/i.test(tags.name || "")) return "garden";
  if (tags.natural === "water" || tags.waterway || tags.water) return "water";
  if (tags.highway) return "street";
  if (tags.leisure) return "leisure";
  return "other";
}

function featureScore(kind, name, parkShort, distance) {
  const parkish = new RegExp(`^${parkShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name);
  const genericParkRoad = parkish && /road|path|drive|loop|trail/i.test(name);
  let base = 50;
  switch (kind) {
    case "artwork":
      base = 100;
      break;
    case "poi":
      base = 95;
      break;
    case "building":
      base = 92;
      break;
    case "garden":
      base = 90;
      break;
    case "water":
      base = 88;
      break;
    case "landmark":
      base = 86;
      break;
    case "street":
      base = genericParkRoad ? 35 : 72;
      break;
    case "leisure":
      base = 70;
      break;
    default:
      base = 40;
  }
  return base - distance * 0.5;
}

function cleanFeatureName(name, parkShort) {
  let n = name.replace(/\s+/g, " ").replace(/^The\s+/i, "").trim();
  // Drop city prefix on well-known locals
  n = n.replace(/^Seattle\s+/i, "");
  // Drop park prefix: "Volunteer Park Reservoir" → "Reservoir"
  if (parkShort) {
    const esc = parkShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    n = n
      .replace(new RegExp(`^${esc}\\s+Park\\s+`, "i"), "")
      .replace(new RegExp(`^${esc}\\s+`, "i"), "");
  }
  return titleCaseWords(n.trim());
}

function nameFromFeature(feat, parkShort) {
  const label = cleanFeatureName(feat.label, parkShort);
  if (!label || /^untitled\b/i.test(label)) return null;
  if (/\bBench\b/i.test(label)) return label;

  switch (feat.kind) {
    case "artwork":
      return `${label} Bench`;
    case "water":
      if (/reservoir/i.test(label)) return /rim|edge|shore/i.test(label) ? `${label} Bench` : `${label} Rim Bench`;
      if (/creek|river|stream/i.test(label)) return `${label} Bench`;
      return `${label} Edge Bench`;
    case "garden":
      return /garden/i.test(label) ? `${label} Bench` : `${label} Garden Bench`;
    case "street": {
      const street = label
        .replace(/\b(Street|Avenue|Drive|Road|Boulevard|Way|Place|Court|Lane)\b/gi, (m) => {
          const map = {
            street: "St",
            avenue: "Ave",
            drive: "Dr",
            road: "Rd",
            boulevard: "Blvd",
            way: "Way",
            place: "Pl",
            court: "Ct",
            lane: "Ln"
          };
          return map[m.toLowerCase()] || m;
        });
      if (/Ave|St|Dr|Blvd|Way|Pl\b/i.test(street)) return `${street} Canopy Bench`;
      return `Along ${street} Bench`;
    }
    case "building":
    case "poi":
    case "landmark":
      return `${label} Bench`;
    default:
      return `${label} Bench`;
  }
}

function parseOsmElements(elements) {
  /** @type {{ name: string; kind: string; lat?: number; lng?: number; geometry?: {lat:number;lon:number}[] }[]} */
  const out = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags["name:en"];
    if (!name) continue;
    if (/^bench$/i.test(name)) continue;
    const kind = featureKind(tags);
    if (el.type === "node") {
      out.push({ name, kind, lat: el.lat, lng: el.lon });
    } else if (el.geometry?.length) {
      out.push({ name, kind, geometry: el.geometry });
    }
  }
  return out;
}

async function overpass(query, { attempts = 3 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "benchmark-rename/1.0"
          },
          body: "data=" + encodeURIComponent(query)
        });
        const text = await res.text();
        if (!res.ok) {
          lastErr = `${url} ${res.status}`;
          continue;
        }
        return JSON.parse(text);
      } catch (e) {
        lastErr = String(e);
      }
    }
    const wait = 800 * attempt * attempt;
    console.warn(`  Overpass retry ${attempt}/${attempts} in ${wait}ms (${lastErr})`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`Overpass failed: ${lastErr}`);
}

function tileKey(lat, lng, size = 0.02) {
  const ti = Math.floor(lat / size);
  const tj = Math.floor(lng / size);
  return `${size}:${ti}:${tj}`;
}

function tileBbox(key) {
  const [sizeStr, ti, tj] = key.split(":");
  const size = Number(sizeStr);
  const south = Number(ti) * size;
  const west = Number(tj) * size;
  return { south, west, north: south + size, east: west + size };
}

async function writeOsmCache(state) {
  await fs.mkdir(path.dirname(OSM_CACHE_PATH), { recursive: true });
  await fs.writeFile(
    OSM_CACHE_PATH,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        tiles: state.tiles,
        features: state.features
      },
      null,
      2
    )
  );
}

async function loadOsmFeatures(benches, { useCache }) {
  if (SKIP_OSM) return [];

  /** @type {{ tiles: Record<string, true>; features: any[] }} */
  let state = { tiles: {}, features: [] };

  if (!useCache) {
    console.log("Fetching OSM from scratch (cache bypassed)");
    state = { tiles: {}, features: [] };
  } else {
    try {
      const cached = JSON.parse(await fs.readFile(OSM_CACHE_PATH, "utf-8"));
      if (Array.isArray(cached?.features)) {
        state.features = cached.features;
        state.tiles = cached.tiles && typeof cached.tiles === "object" ? cached.tiles : {};
        if (Object.keys(state.tiles).length === 0 && state.features.length) {
          console.log(`Loaded ${state.features.length} OSM features from cache`);
          return state.features;
        }
        if (Object.keys(state.tiles).length) {
          console.log(
            `Resuming OSM cache: ${Object.keys(state.tiles).length} tiles, ${state.features.length} features`
          );
        }
      }
    } catch {
      /* fetch fresh */
    }
  }

  if (useCache && state.features.length && Object.keys(state.tiles).length === 0) {
    return state.features;
  }

  const tiles = new Set();
  for (const b of benches) {
    tiles.add(tileKey(b.latitude, b.longitude));
  }
  const pending = [...tiles].filter((k) => !state.tiles[k]);
  console.log(
    `Fetching OSM features for ${pending.length}/${tiles.size} tiles (≤${FEATURE_METERS}m naming)…`
  );

  let i = 0;
  let failures = 0;
  for (const key of pending) {
    i++;
    const { south, west, north, east } = tileBbox(key);
    const pad = 0.0015;
    const s = south - pad;
    const w = west - pad;
    const n = north + pad;
    const e = east + pad;
    const query = `
[out:json][timeout:90];
(
  way["highway"]["name"](${s},${w},${n},${e});
  way["waterway"]["name"](${s},${w},${n},${e});
  way["building"]["name"](${s},${w},${n},${e});
  way["natural"="water"]["name"](${s},${w},${n},${e});
  way["leisure"~"garden|park"]["name"](${s},${w},${n},${e});
  node["tourism"]["name"](${s},${w},${n},${e});
  node["historic"]["name"](${s},${w},${n},${e});
  node["amenity"~"arts_centre|theatre|library|fountain|place_of_worship"]["name"](${s},${w},${n},${e});
  node["building"]["name"](${s},${w},${n},${e});
  node["leisure"~"garden|park"]["name"](${s},${w},${n},${e});
  node["natural"="water"]["name"](${s},${w},${n},${e});
  node["tourism"="artwork"](${s},${w},${n},${e});
);
out body geom;
`;
    try {
      const json = await overpass(query, { attempts: 3 });
      const parsed = parseOsmElements(json.elements || []);
      state.features.push(...parsed);
      state.tiles[key] = true;
      if (i % 3 === 0 || i === pending.length) {
        await writeOsmCache(state);
        console.log(
          `  OSM tiles ${i}/${pending.length} (features ${state.features.length}, saved)`
        );
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      failures++;
      console.warn(`  tile ${key} failed: ${err.message || err}`);
      // Still mark tile attempted so we don't spin forever; park-fallback names cover gaps
      state.tiles[key] = true;
      await writeOsmCache(state);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  await writeOsmCache(state);
  console.log(
    `Cached ${state.features.length} OSM features (${failures} tile failures) → ${OSM_CACHE_PATH}`
  );
  return state.features;
}

function nearestOsmFeature(bench, features, parkShort) {
  const point = { lat: bench.latitude, lng: bench.longitude };
  let best = null;
  for (const f of features) {
    // Skip the park itself as a feature name
    if (new RegExp(`^${parkShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(Park)?$`, "i").test(f.name)) {
      continue;
    }
    let d;
    if (f.geometry?.length) d = minDistToWay(point, f.geometry);
    else if (f.lat != null && f.lng != null) d = distanceMeters(point, { lat: f.lat, lng: f.lng });
    else continue;
    if (d > FEATURE_METERS) continue;
    const score = featureScore(f.kind, f.name, parkShort, d);
    if (!best || score > best.score) {
      best = { label: f.name, kind: f.kind, distance: d, score };
    }
  }
  return best;
}

function buildBaseName(bench, parkCentroid, group, osmFeatures) {
  const park = bench.parkName || bench.siteName || "Seattle";
  const short = shortPark(park);
  const osm = nearestOsmFeature(bench, osmFeatures, short);
  const landmark = nearestLandmark(bench, park);
  const site = siteQualifier(bench, park);
  const bearing = bearingDeg(parkCentroid, { lat: bench.latitude, lng: bench.longitude });
  const dir = cardinal(bearing);
  const setting = settingFromText(park, bench.siteName, osm?.label, landmark?.label);

  // Prefer OSM (real nearby named things) over curated centroids.
  let pick = null;
  if (osm && landmark) {
    pick =
      featureScore(osm.kind, osm.label, short, osm.distance) >=
      featureScore("landmark", landmark.label, short, landmark.distance)
        ? osm
        : landmark;
  } else {
    pick = osm || landmark;
  }

  // Generic internal park roads alone are weak — only use if score stays meaningful
  if (pick?.kind === "street") {
    const parkish = new RegExp(`^${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(pick.label);
    if (parkish) pick = null;
  }
  if (pick && /^untitled\b/i.test(pick.label)) pick = null;

  if (pick) {
    const named = nameFromFeature(pick, short);
    if (named) return { base: named, feature: pick };
  }

  if (site) {
    return { base: `${short} ${site} Bench`, feature: null };
  }

  const noun = settingNoun(setting);
  return { base: `${short} ${titleCaseWords(dir)} ${noun} Bench`, feature: null };
}

function normalizeBase(base) {
  let core = titleCaseWords(base.replace(/\s+bench$/i, "").trim()) + " Bench";
  return core.replace(/\bBench Bench\b/g, "Bench");
}

function sortItems(a, b) {
  return (
    a.bench.longitude - b.bench.longitude ||
    a.bench.latitude - b.bench.latitude ||
    String(a.bench.externalId).localeCompare(String(b.bench.externalId))
  );
}

/** Cluster item indices — complete linkage (every pair ≤ CLUSTER_METERS). */
function clusterItemIndices(items) {
  const unused = new Set(items.map((_, i) => i));
  const clusters = [];
  while (unused.size) {
    const seed = unused.values().next().value;
    unused.delete(seed);
    const members = [seed];
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of [...unused]) {
        const bi = items[i].bench;
        const nearAll = members.every((j) => {
          const bj = items[j].bench;
          return (
            distanceMeters(
              { lat: bi.latitude, lng: bi.longitude },
              { lat: bj.latitude, lng: bj.longitude }
            ) <= CLUSTER_METERS
          );
        });
        if (nearAll) {
          unused.delete(i);
          members.push(i);
          changed = true;
        }
      }
    }
    members.sort((a, b) => sortItems(items[a], items[b]));
    clusters.push(members);
  }
  return clusters;
}

const DIR_WORD_RE =
  /\b(North|Northeast|East|Southeast|South|Southwest|West|Northwest|Mid-West|Mid-East|Center|Upper|Lower)\b/i;

function withDirection(base, dir) {
  const stem = base.replace(/\s+Bench$/i, "").trim();
  const dirTitle = titleCaseWords(dir);
  if (new RegExp(`\\b${dirTitle}\\b`, "i").test(stem)) return `${stem} Bench`;
  // Replace an existing placement word instead of stacking ("Southeast Lawn" + west → "West Lawn")
  if (DIR_WORD_RE.test(stem)) {
    return `${stem.replace(DIR_WORD_RE, dirTitle).replace(/\s+/g, " ").trim()} Bench`;
  }
  return `${stem} ${dirTitle} Bench`;
}

/** Append a direction without rewriting words inside a feature name (e.g. East Highland). */
function withDirectionAppend(base, dir) {
  const stem = base.replace(/\s+Bench$/i, "").trim();
  const dirTitle = titleCaseWords(dir);
  if (new RegExp(`\\b${dirTitle}\\b`, "i").test(stem)) return `${stem} Bench`;
  return `${stem} ${dirTitle} Bench`;
}

function withParkPrefix(base, parkShort) {
  const stem = base.replace(/\s+Bench$/i, "").trim();
  if (new RegExp(`^${parkShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(stem)) {
    return `${stem} Bench`;
  }
  return `${parkShort} ${stem} Bench`.replace(/\s+/g, " ").trim();
}

function clusterCentroid(clusterItems) {
  return {
    lat: clusterItems.reduce((s, it) => s + it.bench.latitude, 0) / clusterItems.length,
    lng: clusterItems.reduce((s, it) => s + it.bench.longitude, 0) / clusterItems.length
  };
}

function disambiguateBases(groups, parkCentroid) {
  const byBase = new Map();
  for (const g of groups) {
    const key = g.base.toLowerCase();
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push(g);
  }
  const labels = ["West", "Mid-West", "Center", "Mid-East", "East", "North", "South", "Upper", "Lower"];
  for (const list of byBase.values()) {
    if (list.length === 1) {
      list[0].resolvedBase = list[0].base;
      continue;
    }
    list.sort((a, b) => {
      const ca = clusterCentroid(a.items);
      const cb = clusterCentroid(b.items);
      return ca.lng - cb.lng || ca.lat - cb.lat;
    });
    const usedResolved = new Set();
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      const c = clusterCentroid(g.items);
      const dir = cardinal(bearingDeg(parkCentroid, c));
      const stem = g.base.replace(/\s+Bench$/i, "").trim();
      const featureLed = g.items.some((it) => it.fromFeature);

      let candidate;
      if (featureLed) {
        // Keep the first cluster clean; later ones get a direction, then "Bench B".
        if (i === 0) candidate = `${stem} Bench`;
        else candidate = `${stem} ${titleCaseWords(dir)} Bench`;
        if (usedResolved.has(candidate.toLowerCase())) {
          candidate = `${stem} ${labels[Math.min(i, labels.length - 1)]} Bench`;
        }
        if (usedResolved.has(candidate.toLowerCase())) {
          candidate = `${stem} Bench ${String.fromCharCode(65 + i)}`;
        }
      } else {
        candidate = withDirection(g.base, dir);
        if (usedResolved.has(candidate.toLowerCase())) {
          candidate = withDirection(g.base, labels[Math.min(i, labels.length - 1)]);
        }
        if (usedResolved.has(candidate.toLowerCase())) {
          candidate = `${stem} Bench ${String.fromCharCode(65 + i)}`;
        }
      }
      usedResolved.add(candidate.toLowerCase());
      g.resolvedBase = candidate;
    }
  }
}

function assignNamesInPark(items, parkCentroid) {
  const clusters = clusterItemIndices(items).map((members) => members.map((i) => items[i]));

  const multiGroups = [];
  const singleGroups = [];

  for (const clusterItems of clusters) {
    for (const item of clusterItems) {
      item.clusterSize = clusterItems.length;
    }
    if (clusterItems.length > 1) {
      const counts = new Map();
      for (const item of clusterItems) {
        counts.set(item.base, (counts.get(item.base) || 0) + 1);
      }
      let bestBase = clusterItems[0].base;
      let bestCount = 0;
      for (const [base, count] of counts) {
        if (count > bestCount) {
          bestBase = base;
          bestCount = count;
        }
      }
      multiGroups.push({ items: clusterItems, base: bestBase });
    } else {
      singleGroups.push({ items: clusterItems, base: clusterItems[0].base });
    }
  }

  disambiguateBases([...multiGroups, ...singleGroups], parkCentroid);

  for (const g of multiGroups) {
    g.items.sort(sortItems);
    for (let k = 0; k < g.items.length; k++) {
      g.items[k].clusterIndex = k + 1;
      g.items[k]._numbered = true;
      g.items[k].name = `${g.resolvedBase} #${k + 1}`;
    }
  }
  for (const g of singleGroups) {
    for (const item of g.items) {
      item.clusterIndex = 1;
      item._numbered = false;
      item.name = g.resolvedBase;
    }
  }

  const used = new Set();
  for (const item of items) {
    let name = item.name;
    let guard = 0;
    while (used.has(name.toLowerCase()) && guard < 40) {
      const park = item.bench.parkName || item.bench.siteName || "Seattle";
      const dir = cardinal(
        bearingDeg(parkCentroid, { lat: item.bench.latitude, lng: item.bench.longitude })
      );
      if (item._numbered) {
        const num = item.clusterIndex;
        const stem = name.replace(/\s+#\d+$/, "");
        if (guard === 0) name = `${withDirection(stem, dir)} #${num}`;
        else if (guard === 1) name = `${withParkPrefix(stem, shortPark(park))} #${num}`;
        else {
          name = `${stem.replace(/\s+Bench$/i, "")} ${String.fromCharCode(65 + guard - 2)} Bench #${num}`;
        }
      } else {
        const prefixed = withParkPrefix(item.base, shortPark(park));
        name =
          guard === 0
            ? withDirection(prefixed, dir)
            : `${prefixed.replace(/\s+Bench$/i, "")} ${String.fromCharCode(65 + guard - 1)} Bench`;
      }
      guard++;
    }
    used.add(name.toLowerCase());
    item.name = name;
  }
}

function buildDescription(bench, parkCentroid, feature) {
  const park = bench.parkName || bench.siteName || "Seattle";
  const bearing = bearingDeg(parkCentroid, { lat: bench.latitude, lng: bench.longitude });
  const dir = cardinal(bearing);
  const bits = [];

  if (feature?.label) {
    bits.push(`A seat by ${feature.label} in ${park}.`);
  } else if (bench.siteName && bench.siteName !== park) {
    bits.push(`Tucked into ${bench.siteName} on the ${dir} side of ${park}.`);
  } else {
    bits.push(`On the ${dir} side of ${park}.`);
  }

  const facts = [];
  if (bench.lengthFt != null) facts.push(`${bench.lengthFt} ft`);
  if (bench.material) facts.push(String(bench.material).toLowerCase());
  if (bench.category) facts.push(String(bench.category).toLowerCase());
  if (facts.length) bits.push(facts.join(" · ") + ".");

  if (bench.donorPlaque) bits.push(`Plaque: ${bench.donorPlaque}.`);
  if (bench.yearInstalled) bits.push(`Installed ${bench.yearInstalled}.`);

  return bits.join(" ").slice(0, 420);
}

async function loadCurrentDbNames(externalIds) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Map();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const map = new Map();
  const ids = [...externalIds].map(String);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("benches")
      .select("external_id,name")
      .eq("source_system", SOURCE_SYSTEM)
      .in("external_id", chunk);
    if (error) {
      console.warn("Could not load current DB names:", error.message);
      break;
    }
    for (const row of data || []) map.set(String(row.external_id), row.name);
  }
  return map;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(BENCHES_PATH, "utf-8"));
  let benches = raw.map((b) => ({ ...b }));
  if (PARK_FILTER) {
    const re = new RegExp(PARK_FILTER, "i");
    benches = benches.filter((b) => re.test(b.parkName || "") || re.test(b.siteName || ""));
    console.log(`Park filter "${PARK_FILTER}" → ${benches.length} benches`);
  }
  if (LIMIT) benches = benches.slice(0, LIMIT);

  const FORCE_OSM = process.argv.includes("--force-osm") || process.argv.includes("--refresh-osm");
  const osmFeatures = await loadOsmFeatures(benches, { useCache: !FORCE_OSM });
  const currentNames = await loadCurrentDbNames(benches.map((b) => b.externalId));

  const byPark = new Map();
  for (const b of benches) {
    const key = b.parkName || b.siteName || "Seattle";
    if (!byPark.has(key)) byPark.set(key, []);
    byPark.get(key).push(b);
  }

  console.log(`Renaming ${benches.length} benches across ${byPark.size} parks${DRY_RUN ? " (dry-run)" : ""}…`);

  const renamed = [];

  for (const [parkKey, group] of byPark) {
    const centroid = {
      lat: group.reduce((s, b) => s + b.latitude, 0) / group.length,
      lng: group.reduce((s, b) => s + b.longitude, 0) / group.length
    };

    const parkItems = [];
    for (const bench of group) {
      const built = buildBaseName(bench, centroid, group, osmFeatures);
      const feature = built.feature;
      const base = normalizeBase(built.base);
      parkItems.push({
        bench,
        base,
        feature,
        fromFeature: !!feature,
        description: buildDescription(bench, centroid, feature)
      });
    }

    assignNamesInPark(parkItems, centroid);

    for (const item of parkItems) {
      const ext = String(item.bench.externalId);
      renamed.push({
        ...item.bench,
        name: item.name,
        description: item.description,
        _oldName: currentNames.get(ext) || item.bench.name,
        _clusterSize: item.clusterSize,
        _clusterIndex: item.clusterIndex,
        _numbered: item._numbered,
        _feature: item.feature
          ? `${item.feature.label} (${item.feature.kind}, ${Math.round(item.feature.distance)}m)`
          : null
      });
    }
  }

  const seen = new Set();
  for (const b of renamed) {
    let n = b.name;
    let guard = 0;
    while (seen.has(n.toLowerCase()) && guard < 40) {
      const park = b.parkName || b.siteName || "Seattle";
      if (b._numbered) {
        const num = b._clusterIndex || 1;
        const stem = n.replace(/\s+#\d+$/, "");
        n =
          guard === 0
            ? `${withParkPrefix(stem, shortPark(park))} #${num}`
            : `${stem.replace(/\s+Bench$/i, "")} ${String.fromCharCode(65 + guard - 1)} Bench #${num}`;
      } else {
        n =
          guard === 0
            ? withParkPrefix(n, shortPark(park))
            : `${n.replace(/\s+Bench$/i, "")} ${String.fromCharCode(65 + guard - 1)} Bench`;
      }
      guard++;
    }
    seen.add(n.toLowerCase());
    b.name = n;
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(renamed, null, 2));

  const unique = new Set(renamed.map((b) => b.name)).size;
  const changed = renamed.filter((b) => b.name !== b._oldName).length;
  console.log(`Wrote ${renamed.length} benches (${unique} unique names, ${changed} changed) → ${OUT_PATH}`);
  console.log("\nSample renames:");
  for (const b of renamed.slice(0, 24)) {
    console.log(`  ${b._oldName}`);
    console.log(`   → ${b.name}${b._feature ? `  [${b._feature}]` : ""}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run only — DB not updated.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env — wrote JSON only.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let updated = 0;
  let errors = 0;
  const samples = [];
  const CONCURRENCY = 24;

  for (let i = 0; i < renamed.length; i += CONCURRENCY) {
    const chunk = renamed.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((b) =>
        supabase
          .from("benches")
          .update({ name: b.name, description: b.description })
          .eq("source_system", SOURCE_SYSTEM)
          .eq("external_id", String(b.externalId))
          .then(({ error }) => ({ b, error }))
      )
    );

    for (const { b, error } of results) {
      if (error) {
        errors++;
        if (samples.length < 8) samples.push(`${b.externalId}: ${error.message}`);
      } else updated++;
    }

    const done = Math.min(i + CONCURRENCY, renamed.length);
    if (done % 200 < CONCURRENCY || done === renamed.length) {
      console.log(`  db ${done}/${renamed.length} (updated ${updated}, errors ${errors})`);
    }
  }

  console.log(`\nDB update done. updated=${updated} errors=${errors}`);
  if (samples.length) console.log(samples.join("\n"));
  if (errors && !updated) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
