/** Material-only bench types (explore type filter). */
export const BENCH_TYPE_OPTIONS = [
  { value: "wooden", label: "wooden" },
  { value: "metal", label: "metal" },
  { value: "concrete", label: "concrete" },
  { value: "composite", label: "composite" },
  { value: "unknown", label: "unknown" }
] as const;

export type BenchTypeValue = (typeof BENCH_TYPE_OPTIONS)[number]["value"];

export const BENCH_TYPE_LABELS: Record<BenchTypeValue, string> = Object.fromEntries(
  BENCH_TYPE_OPTIONS.map((t) => [t.value, t.label])
) as Record<BenchTypeValue, string>;

/** Filterable facet tags (not materials). */
export const BENCH_FACET_TAG_OPTIONS = [
  { value: "park", label: "park" },
  { value: "memorial", label: "memorial" },
  { value: "historic", label: "historic" }
] as const;

export type BenchFacetTag = (typeof BENCH_FACET_TAG_OPTIONS)[number]["value"];

export const BENCH_FACET_TAG_LABELS: Record<BenchFacetTag, string> = Object.fromEntries(
  BENCH_FACET_TAG_OPTIONS.map((t) => [t.value, t.label])
) as Record<BenchFacetTag, string>;

const MATERIAL_TYPES = new Set<string>(BENCH_TYPE_OPTIONS.map((t) => t.value));
const FACET_TAGS = new Set<string>(BENCH_FACET_TAG_OPTIONS.map((t) => t.value));

export type BenchTypeSignals = {
  category?: string | null;
  material?: string | null;
  donorPlaque?: string | null;
  existingType?: string | null;
  /** True when this seat belongs in a park (Seattle Parks import, park_name, etc.). */
  isPark?: boolean | null;
};

function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

function materialFromText(text: string): BenchTypeValue | null {
  if (!text) return null;
  if (text.includes("composite")) return "composite";
  if (text.includes("wood")) return "wooden";
  if (text.includes("concrete") || text.includes("stone")) return "concrete";
  if (text === "metal" || text.startsWith("metal")) return "metal";
  return null;
}

/** Derive material-only bench_type. */
export function normalizeBenchType(signals: BenchTypeSignals): BenchTypeValue {
  const category = norm(signals.category);
  const material = norm(signals.material);
  const existing = norm(signals.existingType);

  const fromMaterial = materialFromText(material);
  if (fromMaterial) return fromMaterial;

  // Category sometimes encodes material (rare).
  const fromCategory = materialFromText(category);
  if (fromCategory) return fromCategory;

  if (existing === "stone") return "concrete";
  if (MATERIAL_TYPES.has(existing) && existing !== "unknown") {
    return existing as BenchTypeValue;
  }

  // GIS leftovers previously stored on bench_type.
  const fromExisting = materialFromText(existing);
  if (fromExisting) return fromExisting;

  return "unknown";
}

/** Derive filterable facet tags (park / memorial / historic). */
export function deriveFacetTags(signals: BenchTypeSignals): BenchFacetTag[] {
  const tags = new Set<BenchFacetTag>();
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

export function isBenchTypeValue(value: string): value is BenchTypeValue {
  return MATERIAL_TYPES.has(value);
}

export function isBenchFacetTag(value: string): value is BenchFacetTag {
  return FACET_TAGS.has(value);
}
