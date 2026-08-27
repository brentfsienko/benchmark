#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import proj4 from "proj4";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CSV_PATH = path.join(ROOT, "scripts", "bench-importer", "data", "seattle-park-bench.csv");
const OUT_PATH = path.join(ROOT, "scripts", "bench-importer", "output", "benches-seattle.json");

// Washington State Plane North, NAD83(HARN), US feet (EPSG:2926).
const EPSG_2926 =
  "+proj=lcc +lat_0=47 +lon_0=-120.833333333333 +lat_1=47.5 +lat_2=48.7333333333333 " +
  "+x_0=500000.0001016002 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

function toLatLng(x, y) {
  const [lng, lat] = proj4(EPSG_2926, WGS84, [Number(x), Number(y)]);
  return { lat, lng };
}

function deriveName(row) {
  const site = (row["Site Name"] || "").trim();
  const park = (row["Park Name"] || "").trim();
  const primary = site || park;
  const material = (row["Bench Material"] || "").trim();
  const category = (row["Bench Category"] || "").trim();
  const descriptor = [category, material].filter(Boolean).join(" ");

  if (primary && descriptor) return `${primary} – ${descriptor} Bench`;
  if (primary) return `${primary} Bench`;
  return `Seattle Park Bench #${row["OBJECTID"]}`;
}

function deriveLength(row) {
  const raw = (row["Bench Length"] || "").trim();
  const n = Number(raw);
  if (raw && Number.isFinite(n) && n > 0) return n;
  return null;
}

async function main() {
  const csvText = await fs.readFile(CSV_PATH, "utf-8");
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true
  });

  console.log(`Parsed ${rows.length} rows from CSV`);

  const benches = [];
  let skipped = 0;

  for (const row of rows) {
    const x = row["x"];
    const y = row["y"];
    if (!x || !y) {
      skipped++;
      console.warn(`Skipping OBJECTID ${row["OBJECTID"]}: missing x/y coordinates`);
      continue;
    }

    const { lat, lng } = toLatLng(x, y);
    const lengthFt = deriveLength(row);

    benches.push({
      externalId: String(row["OBJECTID"]),
      idPrefix: "bench-sea",
      globalId: row["GLOBALID"] || null,
      sourceSystem: "Seattle Parks & Recreation (DPR) GIS — Park Bench",
      name: deriveName(row),
      parkName: (row["Park Name"] || "").trim() || null,
      siteName: (row["Site Name"] || "").trim() || null,
      category: (row["Bench Category"] || "").trim() || null,
      material: (row["Bench Material"] || "").trim() || null,
      lengthFt,
      yearInstalled: (row["Year Bench Installed"] || "").trim() || null,
      donorPlaque: (row["Plaque Text (Donor Log)"] || "").trim() || null,
      program: (row["Bench Program"] || "").trim() || null,
      donorStatus: (row["Bench Program Donor Status"] || "").trim() || null,
      latitude: lat,
      longitude: lng,
      photos: [],
      source: { rawRow: row }
    });
  }

  const sample = benches[0];
  if (sample) {
    const latOk = sample.latitude > 47.3 && sample.latitude < 47.9;
    const lngOk = sample.longitude > -122.6 && sample.longitude < -122.1;
    console.log(`Sanity check on first bench: lat=${sample.latitude}, lng=${sample.longitude}`);
    if (!latOk || !lngOk) {
      throw new Error(
        "Reprojected coordinates look wrong (outside Seattle's bounding box). " +
          "Stop and double-check the EPSG:2926 proj4 string before continuing."
      );
    }
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(benches, null, 2));
  console.log(`Wrote ${benches.length} benches to ${OUT_PATH} (skipped ${skipped} with missing coordinates)`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
