/**
 * Material-only types + facet tags. Keep in sync with src/lib/bench-type.ts.
 */

export const BENCH_TYPE_OPTIONS = [
  { value: "wooden", label: "wooden" },
  { value: "metal", label: "metal" },
  { value: "concrete", label: "concrete" },
  { value: "composite", label: "composite" },
  { value: "unknown", label: "unknown" }
];

export const BENCH_FACET_TAG_OPTIONS = [
  { value: "park", label: "park" },
  { value: "memorial", label: "memorial" },
  { value: "historic", label: "historic" }
];

const MATERIAL_TYPES = new Set(BENCH_TYPE_OPTIONS.map((t) => t.value));

function norm(s) {
  return (s ?? "").trim().toLowerCase();
}

function materialFromText(text) {
  if (!text) return null;
  if (text.includes("composite")) return "composite";
  if (text.includes("wood")) return "wooden";
  if (text.includes("concrete") || text.includes("stone")) return "concrete";
  if (text === "metal" || text.startsWith("metal")) return "metal";
  return null;
}

export function normalizeBenchType(signals = {}) {
  const category = norm(signals.category);
  const material = norm(signals.material);
  const existing = norm(signals.existingType);

  const fromMaterial = materialFromText(material);
  if (fromMaterial) return fromMaterial;

  const fromCategory = materialFromText(category);
  if (fromCategory) return fromCategory;

  if (existing === "stone") return "concrete";
  if (MATERIAL_TYPES.has(existing) && existing !== "unknown") return existing;

  const fromExisting = materialFromText(existing);
  if (fromExisting) return fromExisting;

  return "unknown";
}

export function deriveFacetTags(signals = {}) {
  const tags = new Set();
  const category = norm(signals.category);
  const existing = norm(signals.existingType);
  const plaque = (signals.donorPlaque ?? "").trim();

  if (signals.isPark) tags.add("park");
  if (plaque.length > 0) tags.add("memorial");
  if (
    category.includes("olmsted") ||
    category.includes("historic") ||
    existing.includes("olmsted") ||
    existing.includes("historic")
  ) {
    tags.add("historic");
  }

  return [...tags];
}
