#!/usr/bin/env node
/**
 * Recompute material-only benches.bench_type + facet tags (park / memorial / historic).
 *
 * Usage:
 *   npm run import:benches:types -- --dry-run
 *   npm run import:benches:types
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { deriveFacetTags, normalizeBenchType } from "./bench-type.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
loadEnv({ path: path.join(ROOT, ".env.local") });

const FACET_TAGS = ["park", "memorial", "historic"];
const PAGE = 500;

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;

function isParkBench(b) {
  if (String(b.id || "").startsWith("bench-sea-")) return true;
  if (b.park_name) return true;
  if (String(b.source_system || "").toLowerCase().includes("seattle parks")) return true;
  if (String(b.id || "").startsWith("bench-gl-") || String(b.id || "").startsWith("bench-vp-")) {
    return true;
  }
  return false;
}

async function fetchAll(supabase) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from("benches")
      .select("id, bench_type, category, material, donor_plaque, park_name, source_system")
      .order("id")
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    if (LIMIT && rows.length >= LIMIT) break;
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const benches = await fetchAll(supabase);
  console.log(`Loaded ${benches.length} benches${DRY_RUN ? " (dry-run)" : ""}…`);

  const beforeType = {};
  const afterType = {};
  const tagAdds = { park: 0, memorial: 0, historic: 0 };
  const typeChanges = [];
  const tagPlans = [];

  for (const b of benches) {
    beforeType[b.bench_type || "(null)"] = (beforeType[b.bench_type || "(null)"] || 0) + 1;
    const signals = {
      category: b.category,
      material: b.material,
      donorPlaque: b.donor_plaque,
      existingType: b.bench_type,
      isPark: isParkBench(b)
    };
    const nextType = normalizeBenchType(signals);
    const facets = deriveFacetTags(signals);
    afterType[nextType] = (afterType[nextType] || 0) + 1;
    if (nextType !== b.bench_type) {
      typeChanges.push({ id: b.id, from: b.bench_type, to: nextType });
    }
    for (const t of facets) tagAdds[t] = (tagAdds[t] || 0) + 1;
    tagPlans.push({ id: b.id, facets });
  }

  console.log("\nbench_type before:");
  for (const [k, v] of Object.entries(beforeType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}\t${k}`);
  }
  console.log("\nbench_type after (material-only):");
  for (const [k, v] of Object.entries(afterType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}\t${k}`);
  }
  console.log("\nfacet tags to ensure:");
  for (const [k, v] of Object.entries(tagAdds)) console.log(`  ${v}\t${k}`);
  console.log(`\ntype changes: ${typeChanges.length}`);

  if (DRY_RUN) {
    console.log("\nDry run only — DB not updated.");
    return;
  }

  let typeUpdated = 0;
  let typeErrors = 0;
  const BATCH = 40;
  for (let i = 0; i < typeChanges.length; i += BATCH) {
    const slice = typeChanges.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (c) => {
        const { error } = await supabase.from("benches").update({ bench_type: c.to }).eq("id", c.id);
        if (error) {
          typeErrors += 1;
          console.error(`  type fail ${c.id}:`, error.message);
        } else typeUpdated += 1;
      })
    );
    console.log(`  types ${Math.min(i + BATCH, typeChanges.length)}/${typeChanges.length}`);
  }

  // Sync facet tags: remove stale facets, upsert desired.
  let tagUpserts = 0;
  let tagDeletes = 0;
  let tagErrors = 0;
  for (let i = 0; i < tagPlans.length; i += BATCH) {
    const slice = tagPlans.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (plan) => {
        const desired = new Set(plan.facets);
        const { data: existing, error: readErr } = await supabase
          .from("bench_tags")
          .select("tag")
          .eq("bench_id", plan.id)
          .in("tag", FACET_TAGS);
        if (readErr) {
          tagErrors += 1;
          return;
        }
        const have = new Set((existing ?? []).map((r) => r.tag));
        const toDelete = [...have].filter((t) => !desired.has(t));
        const toAdd = [...desired].filter((t) => !have.has(t));
        if (toDelete.length) {
          const { error } = await supabase
            .from("bench_tags")
            .delete()
            .eq("bench_id", plan.id)
            .in("tag", toDelete);
          if (error) tagErrors += 1;
          else tagDeletes += toDelete.length;
        }
        if (toAdd.length) {
          const { error } = await supabase.from("bench_tags").upsert(
            toAdd.map((tag) => ({ bench_id: plan.id, tag })),
            { onConflict: "bench_id,tag", ignoreDuplicates: true }
          );
          if (error) tagErrors += 1;
          else tagUpserts += toAdd.length;
        }
      })
    );
    if ((i / BATCH) % 10 === 0) {
      console.log(`  tags ${Math.min(i + BATCH, tagPlans.length)}/${tagPlans.length}`);
    }
  }

  console.log(
    `\nDone. types updated=${typeUpdated} errors=${typeErrors}; tags +${tagUpserts} -${tagDeletes} errors=${tagErrors}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
