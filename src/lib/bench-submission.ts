/** Validation for new benches: admins get the full payload, signed-in users a safe subset. */

export const MAX_NAME_LENGTH = 80;
export const MAX_NEIGHBORHOOD_LENGTH = 80;
export const MAX_TYPE_LENGTH = 40;
export const MAX_DESCRIPTION_LENGTH = 500;
/** Benches one non-admin user may add in a rolling 24 hours. */
export const USER_DAILY_BENCH_LIMIT = 10;

export type BenchSubmission = {
  name: string;
  neighborhood: string;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
  viewScore: number;
  remotenessScore: number;
  popularityScore: number;
  averageRating: number;
  tags: string[];
};

export type BenchSubmissionResult = { ok: true; value: BenchSubmission } | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function score(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a create-bench request body. Non-admins can only set the bench's text and
 * location: scores and rating start at 0 and the bench is tagged "user-submitted".
 */
export function parseBenchSubmission(body: unknown, opts: { isAdmin: boolean }): BenchSubmissionResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name);
  const neighborhood = text(b.neighborhood);
  const type = text(b.type) || "park";
  const description = text(b.description);
  const latitude = Number(b.latitude);
  const longitude = Number(b.longitude);

  if (!name) return { ok: false, error: "Name is required" };
  if (!neighborhood) return { ok: false, error: "Neighborhood is required" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` };
  if (neighborhood.length > MAX_NEIGHBORHOOD_LENGTH) {
    return { ok: false, error: `Neighborhood must be ${MAX_NEIGHBORHOOD_LENGTH} characters or fewer` };
  }
  if (type.length > MAX_TYPE_LENGTH) return { ok: false, error: "Bench type is too long" };
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` };
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { ok: false, error: "Latitude must be between -90 and 90" };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, error: "Longitude must be between -180 and 180" };
  }

  if (!opts.isAdmin) {
    return {
      ok: true,
      value: {
        name,
        neighborhood,
        type,
        description,
        latitude,
        longitude,
        viewScore: 0,
        remotenessScore: 0,
        popularityScore: 0,
        averageRating: 0,
        tags: ["user-submitted"]
      }
    };
  }

  return {
    ok: true,
    value: {
      name,
      neighborhood,
      type,
      description,
      latitude,
      longitude,
      viewScore: score(b.viewScore),
      remotenessScore: score(b.remotenessScore),
      popularityScore: score(b.popularityScore),
      averageRating: score(b.averageRating),
      tags: Array.isArray(b.tags) ? b.tags.map((t) => String(t)) : ["user-submitted"]
    }
  };
}
