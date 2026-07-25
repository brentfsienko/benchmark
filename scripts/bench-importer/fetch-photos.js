#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BENCHES_PATH = path.join(ROOT, "scripts", "bench-importer", "output", "benches-seattle.json");
const LAYER_URL =
  "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Park_Bench/FeatureServer/0";
const CONCURRENCY = 8;
const RETRIES = 2;

async function withRetry(fn, retries = RETRIES) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchAttachmentsFor(objectId) {
  const url = `${LAYER_URL}/${objectId}/attachments?f=json`;
  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for OBJECTID ${objectId}`);
    const data = await res.json();
    const infos = data.attachmentInfos || [];
    return infos.map((info) => ({
      url: `${LAYER_URL}/${objectId}/attachments/${info.id}`,
      contentType: info.contentType || null,
      name: info.name || null,
      size: info.size ?? null
    }));
  });
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      try {
        results[current] = await fn(items[current], current);
      } catch (err) {
        results[current] = { error: err.message };
      }
      done++;
      if (done % 100 === 0 || done === items.length) {
        console.log(`  processed ${done}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function main() {
  const raw = await fs.readFile(BENCHES_PATH, "utf-8");
  const benches = JSON.parse(raw);

  console.log(`Fetching attachments for ${benches.length} benches (concurrency: ${CONCURRENCY})...`);
  console.log("This can take several minutes. Do not raise concurrency much higher.");

  const results = await mapWithConcurrency(benches, CONCURRENCY, (bench) =>
    fetchAttachmentsFor(bench.externalId)
  );

  let withPhotos = 0;
  let errors = 0;
  for (let i = 0; i < benches.length; i++) {
    const result = results[i];
    if (Array.isArray(result)) {
      benches[i].photos = result;
      if (result.length > 0) withPhotos++;
    } else {
      benches[i].photos = [];
      benches[i].photoFetchError = result?.error ?? "unknown error";
      errors++;
    }
  }

  await fs.writeFile(BENCHES_PATH, JSON.stringify(benches, null, 2));
  console.log(
    `Done. ${withPhotos} benches have at least one photo. ${errors} had fetch errors (see photoFetchError).`
  );
}

main().catch((err) => {
  console.error("Photo fetch failed:", err.message);
  process.exit(1);
});
