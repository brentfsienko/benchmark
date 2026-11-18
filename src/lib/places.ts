/** Place (city, neighborhood, address, park…) search for the explore map, backed by MapTiler geocoding. */

export type PlaceResult = {
  id: string;
  /** Short name, e.g. "Green Lake". */
  name: string;
  /** Context line, e.g. "Seattle, Washington, United States". */
  label: string;
  latitude: number;
  longitude: number;
  /** [west, south, east, north] when the provider knows the place's extent. */
  bbox?: [number, number, number, number];
};

/** Fallback zoom for a place without a bbox (a single point, e.g. an address or POI). */
export const PLACE_POINT_ZOOM = 16;
/** Never fly in further than this when fitting a place's bbox. */
export const PLACE_MAX_ZOOM = 17;

const MAPTILER_GEOCODING_URL = "https://api.maptiler.com/geocoding";

export function buildMapTilerGeocodingUrl(
  query: string,
  key: string,
  opts: { limit?: number; proximity?: { lat: number; lng: number } } = {}
): string {
  const params = new URLSearchParams({
    key,
    autocomplete: "true",
    fuzzyMatch: "true",
    limit: String(opts.limit ?? 5)
  });
  if (opts.proximity) {
    params.set("proximity", `${opts.proximity.lng},${opts.proximity.lat}`);
  }
  return `${MAPTILER_GEOCODING_URL}/${encodeURIComponent(query)}.json?${params.toString()}`;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Map a MapTiler (Mapbox-style GeoJSON) geocoding response to place results; drops malformed features. */
export function parseMapTilerGeocoding(json: unknown): PlaceResult[] {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];

  const out: PlaceResult[] = [];
  for (const raw of features) {
    const f = raw as Record<string, unknown>;
    const center = Array.isArray(f.center) ? f.center : (f.geometry as { coordinates?: unknown })?.coordinates;
    if (!Array.isArray(center) || !finite(center[0]) || !finite(center[1])) continue;
    const [longitude, latitude] = center as [number, number];
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;

    const placeName = typeof f.place_name === "string" ? f.place_name : "";
    const name = typeof f.text === "string" && f.text ? f.text : placeName.split(",")[0]?.trim() ?? "";
    if (!name) continue;
    // place_name is "Green Lake, Seattle, Washington, United States" — drop the leading name.
    const label = placeName.startsWith(name) ? placeName.slice(name.length).replace(/^,\s*/, "") : placeName;

    const result: PlaceResult = {
      id: String(f.id ?? `${longitude},${latitude}`),
      name,
      label,
      latitude,
      longitude
    };
    const bbox = f.bbox;
    if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(finite)) {
      const [w, s, e, n] = bbox as [number, number, number, number];
      // A zero-area bbox is really a point; let the caller use PLACE_POINT_ZOOM.
      if (n > s && (e !== w)) result.bbox = [w, s, e, n];
    }
    out.push(result);
  }
  return out;
}
