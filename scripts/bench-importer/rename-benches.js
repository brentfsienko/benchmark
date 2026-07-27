#!/usr/bin/env node
/**
 * Rename Seattle import benches with more specific, location-aware names.
 *
 * Strategy (no bulk geocoding):
 * - Park centroid → north/south/east/west placement
 * - Site name when it adds specificity
 * - Curated landmark hints for major Seattle parks
 * - Setting hints from park/site keywords (shore, garden, trail…)
 * - Only append #N when benches sit in a tight proximity cluster (~20m)
 * - Distant benches with the same landmark get a direction qualifier instead
 *
 * Usage:
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

const EARTH_M = 6_371_000;
/**
 * Max pairwise distance for a numbered collection (complete-linkage).
 * Keeps shore "chains" from merging into one giant #1…#30 group.
 */
const CLUSTER_METERS = 12;

/**
 * Hand-tuned landmark zones (lat,lng,radiusM,label).
 * Radii are intentionally tight (~45–90m) so POI names only apply when the bench
 * is actually near that feature — not anywhere in the same park.
 */
const PARK_LANDMARKS = {
  "Green Lake": [
    { lat: 47.6762, lng: -122.3345, r: 70, label: "South Duck Pond" },
    { lat: 47.6848, lng: -122.3370, r: 70, label: "North Beach" }
  ],
  "Alki Beach Park": [
    { lat: 47.5768, lng: -122.4188, r: 80, label: "Alki Point" },
    { lat: 47.5805, lng: -122.4075, r: 70, label: "Statue of Liberty" },
    { lat: 47.5915, lng: -122.3935, r: 80, label: "Don Armeni Boat Ramp" }
  ],
  "Lincoln Park": [
    { lat: 47.5295, lng: -122.3995, r: 75, label: "Colman Pool" },
    { lat: 47.5275, lng: -122.3965, r: 70, label: "South Beach Stairs" },
    { lat: 47.5362, lng: -122.3962, r: 70, label: "North Entrance" }
  ],
  "Cal Anderson Park": [
    { lat: 47.6173, lng: -122.3193, r: 55, label: "Reflecting Pool" },
    { lat: 47.6182, lng: -122.3190, r: 55, label: "Shelter House" },
    { lat: 47.6156, lng: -122.3188, r: 55, label: "Pine Street Corner" },
    { lat: 47.6178, lng: -122.3196, r: 50, label: "Broadway Terrace" }
  ],
  "Green Lake Park": [
    { lat: 47.6762, lng: -122.3345, r: 70, label: "South Duck Pond" },
    { lat: 47.6828, lng: -122.3348, r: 75, label: "Bathhouse Theater" },
    { lat: 47.6848, lng: -122.3370, r: 70, label: "North Beach" },
    { lat: 47.6780, lng: -122.3385, r: 70, label: "Community Center" },
    { lat: 47.6805, lng: -122.3425, r: 65, label: "West Shore" }
  ],
  "Warren G. Magnuson Park": [
    { lat: 47.6805, lng: -122.2518, r: 80, label: "Promontory Point" },
    { lat: 47.6828, lng: -122.2485, r: 75, label: "Boat Launch" },
    { lat: 47.6775, lng: -122.2555, r: 80, label: "Wetland Trails" }
  ],
  "Washington Park and Arboretum": [
    { lat: 47.6398, lng: -122.2945, r: 70, label: "Japanese Garden" },
    { lat: 47.6392, lng: -122.2968, r: 65, label: "Azalea Way" },
    { lat: 47.6435, lng: -122.2935, r: 75, label: "Foster Island" },
    { lat: 47.6375, lng: -122.2985, r: 70, label: "Graham Visitors Center" }
  ],
  "Seward Park": [
    { lat: 47.5555, lng: -122.2505, r: 80, label: "Peninsula Tip" },
    { lat: 47.5508, lng: -122.2528, r: 75, label: "South Beach" },
    { lat: 47.5588, lng: -122.2535, r: 75, label: "Andrews Bay" }
  ],
  "Golden Gardens Park": [
    { lat: 47.6918, lng: -122.4035, r: 75, label: "North Beach Fire Pits" },
    { lat: 47.6885, lng: -122.4028, r: 70, label: "Bathhouse" },
    { lat: 47.6935, lng: -122.4022, r: 70, label: "Sand Spit" }
  ],
  "Volunteer Park": [
    { lat: 47.6302, lng: -122.3148, r: 60, label: "Conservatory" },
    { lat: 47.6315, lng: -122.3155, r: 60, label: "Water Tower" },
    { lat: 47.6295, lng: -122.3135, r: 60, label: "Asian Art Museum" },
    { lat: 47.6288, lng: -122.3158, r: 55, label: "Amphitheater" },
    { lat: 47.6308, lng: -122.3165, r: 50, label: "Dahlia Garden" }
  ],
  "Lake Union Park": [
    { lat: 47.6275, lng: -122.3378, r: 65, label: "Center for Wooden Boats" },
    { lat: 47.6288, lng: -122.3395, r: 60, label: "MOHAI" }
  ],
  "Kerry Park and Viewpoint": [
    { lat: 47.6295, lng: -122.3598, r: 55, label: "Skyline Overlook" }
  ],
  "Gas Works Park": [
    { lat: 47.6458, lng: -122.3355, r: 70, label: "Kite Hill" },
    { lat: 47.6452, lng: -122.3368, r: 60, label: "Exhauster Building" },
    { lat: 47.6465, lng: -122.3342, r: 60, label: "Lake Union Shore" }
  ],
  "Discovery Park": [
    { lat: 47.6615, lng: -122.4185, r: 80, label: "West Point Lighthouse" },
    { lat: 47.6578, lng: -122.4255, r: 80, label: "South Beach" },
    { lat: 47.66, lng: -122.41, r: 75, label: "Parade Ground" }
  ],
  "Myrtle Edwards Park": [
    { lat: 47.6185, lng: -122.3605, r: 70, label: "Sculpture Park Edge" }
  ],
  "Carkeek Park": [
    { lat: 47.7125, lng: -122.3775, r: 75, label: "Piper's Creek" },
    { lat: 47.7118, lng: -122.3815, r: 70, label: "Railroad Bridge Beach" }
  ],
  "Victor Steinbrueck Park": [
    { lat: 47.6095, lng: -122.3425, r: 50, label: "Pike Place Overlook" },
    { lat: 47.6098, lng: -122.3432, r: 45, label: "Elliott Bay Totems" }
  ]
};

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;

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
  if (/pond|duck|fountain|waterfall|creek|river|canal|wetland|marsh/.test(blob)) return "waterside";
  if (/garden|arboretum|rose|dahlia|conservatory|botanic|azalea/.test(blob)) return "garden";
  if (/viewpoint|overlook|vista|skyline|bluff|promontory/.test(blob)) return "overlook";
  if (/trail|path|boulevard|promenade|loop|corridor/.test(blob)) return "trail";
  if (/grove|wood|forest|meadow|lawn|fir/.test(blob)) return "grove";
  if (/pier|dock|ramp|boat|marina/.test(blob)) return "pier";
  if (/playfield|sports|ballfield/.test(blob)) return "playfield";
  return "path";
}

function nearestLandmark(bench, parkName) {
  const list = PARK_LANDMARKS[parkName] || PARK_LANDMARKS[bench.parkName] || [];
  let best = null;
  for (const lm of list) {
    const d = distanceMeters(
      { lat: bench.latitude, lng: bench.longitude },
      { lat: lm.lat, lng: lm.lng }
    );
    if (d > lm.r) continue;
    if (!best || d < best.distance) best = { label: lm.label, distance: d };
  }
  return best;
}

function siteQualifier(bench, park) {
  const site = (bench.siteName || "").trim();
  if (!site) return null;
  if (site.toLowerCase() === (park || "").toLowerCase()) return null;

  const short = shortPark(park);
  // Prefer parenthetical locality: "Kerry Park (Franklin Place)" → "Franklin Place"
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
  // Skip material/category leftovers from GIS.
  if (/wood|metal|standard|approved|concrete|composite/i.test(q)) return null;
  const qLower = q.toLowerCase();
  if (qLower === short.toLowerCase() || qLower.includes(short.toLowerCase())) return null;
  return q;
}

function bandLabel(group, bench) {
  if (group.length < 6) return null;
  const lats = group.map((b) => b.latitude);
  const lngs = group.map((b) => b.longitude);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const useLat = latSpan >= lngSpan;
  const vals = useLat ? lats : lngs;
  const v = useLat ? bench.latitude : bench.longitude;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max - min < 1e-6) return null;
  const t = (v - min) / (max - min);
  if (useLat) {
    if (t < 0.33) return "south stretch";
    if (t < 0.66) return "mid stretch";
    return "north stretch";
  }
  if (t < 0.33) return "west stretch";
  if (t < 0.66) return "mid stretch";
  return "east stretch";
}

function buildBaseName(bench, parkCentroid, group) {
  const park = bench.parkName || bench.siteName || "Seattle";
  const short = shortPark(park);
  // Only accept a POI label when the bench is inside that landmark's tight radius.
  const landmark = nearestLandmark(bench, park);
  const site = siteQualifier(bench, park);
  const bearing = bearingDeg(parkCentroid, { lat: bench.latitude, lng: bench.longitude });
  const dir = cardinal(bearing);
  const band = bandLabel(group, bench);

  if (landmark) {
    const label = landmark.label;
    if (/\bBench\b/i.test(label)) return label;
    return `${label} Bench`;
  }

  if (site) {
    return `${short} ${site} Bench`;
  }

  if (band) {
    return `${short} ${titleCaseWords(band)} Bench`;
  }

  return `${short} ${titleCaseWords(dir)} Bench`;
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

function withDirection(base, dir) {
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
  // When multiple groups share a base, give each a unique direction/label.
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
      let candidate = withDirection(g.base, dir);
      if (usedResolved.has(candidate.toLowerCase())) {
        candidate = withDirection(g.base, labels[Math.min(i, labels.length - 1)]);
      }
      if (usedResolved.has(candidate.toLowerCase())) {
        candidate = `${g.base.replace(/\s+Bench$/i, "")} ${String.fromCharCode(65 + i)} Bench`;
      }
      usedResolved.add(candidate.toLowerCase());
      g.resolvedBase = candidate;
    }
  }
}

/**
 * Number only proximity clusters (#1…#n). Separate clusters that share a base
 * get a direction qualifier; distant singles never get collection numbers.
 */
function assignNamesInPark(items, parkCentroid) {
  const clusters = clusterItemIndices(items).map((members) =>
    members.map((i) => items[i])
  );

  /** @type {{ items: typeof items; base: string }[]} */
  const multiGroups = [];
  /** @type {{ items: typeof items; base: string }[]} */
  const singleGroups = [];

  for (const clusterItems of clusters) {
    for (const item of clusterItems) {
      item.clusterSize = clusterItems.length;
    }
    if (clusterItems.length > 1) {
      // Number the physical collection as one group (shared proximity).
      // Use the most common base in the cluster as the collection name.
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

  // Direction-qualify when multiple multi-groups (or singles) share a base.
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
        // Keep this seat's index inside its cluster; only specialize the stem.
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

function buildDescription(bench, parkCentroid, landmark) {
  const park = bench.parkName || bench.siteName || "Seattle";
  const bearing = bearingDeg(parkCentroid, { lat: bench.latitude, lng: bench.longitude });
  const dir = cardinal(bearing);
  const bits = [];

  if (landmark) {
    bits.push(`A seat near ${landmark.label} in ${park}.`);
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

async function main() {
  const raw = JSON.parse(await fs.readFile(BENCHES_PATH, "utf-8"));
  let benches = raw.map((b) => ({ ...b }));
  if (LIMIT) benches = benches.slice(0, LIMIT);

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
      const landmark = nearestLandmark(bench, parkKey);
      const base = normalizeBase(buildBaseName(bench, centroid, group));
      parkItems.push({
        bench,
        base,
        landmark,
        description: buildDescription(bench, centroid, landmark)
      });
    }

    assignNamesInPark(parkItems, centroid);

    for (const item of parkItems) {
      renamed.push({
        ...item.bench,
        name: item.name,
        description: item.description,
        _oldName: item.bench.name,
        _clusterSize: item.clusterSize,
        _clusterIndex: item.clusterIndex,
        _numbered: item._numbered,
        _landmark: item.landmark?.label ?? null
      });
    }
  }

  // Global uniqueness — never invent #N for non-clustered benches.
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
  for (const b of renamed.slice(0, 14)) {
    console.log(`  ${b._oldName}`);
    console.log(`   → ${b.name}${b._landmark ? `  [${b._landmark}]` : ""}`);
    console.log(`     ${b.description}`);
  }

  // Show a high-dup park slice
  const alki = renamed.filter((b) => (b.parkName || "").includes("Alki")).slice(0, 8);
  if (alki.length) {
    console.log("\nAlki sample:");
    for (const b of alki) console.log(`  ${b.name}`);
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
