#!/usr/bin/env node
/**
 * Idempotent upsert of Seattle park benches into Supabase.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run import:benches
 *   npm run import:benches -- --file=./scripts/bench-importer/output/benches-seattle.json
 *   npm run import:benches -- --limit=50
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { deriveFacetTags, normalizeBenchType } from "./bench-importer/bench-type.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
loadEnv({ path: path.join(ROOT, ".env.local") });

const SOURCE_SYSTEM = "Seattle Parks & Recreation (DPR) GIS — Park Bench";
const DEFAULT_FILE = path.join(
  ROOT,
  "scripts",
  "bench-importer",
  "output",
  "benches-seattle.json"
);

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

function buildDescription(bench) {
  const parts = [];
  if (bench.donorPlaque) parts.push(`Plaque: ${bench.donorPlaque}`);
  if (bench.lengthFt != null) parts.push(`${bench.lengthFt} ft`);
  if (bench.material) parts.push(bench.material);
  if (bench.category) parts.push(bench.category);
  if (bench.yearInstalled) parts.push(`Installed ${bench.yearInstalled}`);
  return parts.join(" · ");
}

function toRpcPayload(bench) {
  const neighborhood = bench.parkName || bench.siteName || "Seattle";
  const signals = {
    category: bench.category,
    material: bench.material,
    donorPlaque: bench.donorPlaque,
    isPark: true
  };
  const benchType = normalizeBenchType(signals);
  const facetTags = deriveFacetTags(signals);
  const photoUrls = (bench.photos || []).map((p) => p.url).filter(Boolean);
  return {
    p_id: `bench-sea-${bench.externalId}`,
    p_name: bench.name,
    p_neighborhood: neighborhood,
    p_bench_type: benchType,
    p_description: buildDescription(bench),
    p_lat: bench.latitude,
    p_lng: bench.longitude,
    p_external_id: String(bench.externalId),
    p_global_id: bench.globalId,
    p_source_system: SOURCE_SYSTEM,
    p_park_name: bench.parkName,
    p_site_name: bench.siteName,
    p_category: bench.category,
    p_material: bench.material,
    p_length_ft: bench.lengthFt,
    p_year_installed: bench.yearInstalled,
    p_donor_plaque: bench.donorPlaque,
    p_program: bench.program,
    p_donor_status: bench.donorStatus,
    p_photo_urls: photoUrls,
    p_source_raw: bench.source?.rawRow ?? null,
    p_created_by_user_id: "user-1",
    p_tags: ["seattle-parks", ...facetTags]
  };
}

async function main() {
  const file = path.resolve(ROOT, argValue("--file") || DEFAULT_FILE);
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Number(limitRaw) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.\n" +
        "Add the service role key from Supabase Dashboard → Project Settings → API, then re-run."
    );
    process.exit(1);
  }

  const raw = await fs.readFile(file, "utf-8");
  let benches = JSON.parse(raw);
  if (limit && Number.isFinite(limit)) benches = benches.slice(0, limit);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorSamples = [];

  console.log(`Upserting ${benches.length} benches from ${file}`);

  for (let i = 0; i < benches.length; i++) {
    const bench = benches[i];
    const payload = toRpcPayload(bench);

    const { data: existing } = await supabase
      .from("benches")
      .select("id")
      .eq("source_system", SOURCE_SYSTEM)
      .eq("external_id", String(bench.externalId))
      .maybeSingle();

    const { error } = await supabase.rpc("upsert_imported_bench", payload);
    if (error) {
      errors++;
      if (errorSamples.length < 8) {
        errorSamples.push(`OBJECTID ${bench.externalId}: ${error.message}`);
      }
    } else if (existing?.id) {
      updated++;
    } else {
      created++;
    }

    if ((i + 1) % 100 === 0 || i + 1 === benches.length) {
      console.log(`  ${i + 1}/${benches.length} (created ${created}, updated ${updated}, errors ${errors})`);
    }
  }

  console.log("\nSummary");
  console.log(`  created: ${created}`);
  console.log(`  updated: ${updated}`);
  console.log(`  errors:  ${errors}`);
  if (errorSamples.length) {
    console.log("  sample errors:");
    for (const line of errorSamples) console.log(`   - ${line}`);
  }

  if (errors > 0 && created + updated === 0) process.exit(1);
}

main().catch((err) => {
  console.error("Upsert failed:", err.message);
  process.exit(1);
});
