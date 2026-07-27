/** Persisted explore map camera + helpers for pin prefetch before Leaflet boots. */

export type SavedMapView = { lat: number; lng: number; zoom: number };

export type ViewportBoundsLike = {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
  zoom?: number;
};

export const LAST_MAP_KEY = "benchmark:lastMapView";
export const NEARBY_ZOOM = 15;
/** Neutral world overview — used only when there is no saved view and GPS fails. */
export const WORLD_MAP_CENTER = { lat: 20, lng: 0 } as const;
export const WORLD_ZOOM = 2;

export function readSavedMapView(): SavedMapView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_MAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedMapView;
    if (
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lng) ||
      !Number.isFinite(parsed.zoom)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSavedMapView(lat: number, lng: number, zoom: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_MAP_KEY, JSON.stringify({ lat, lng, zoom }));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Approximate Leaflet viewport around a point without waiting for the map.
 * Good enough to prefetch pins while GPS / Leaflet race.
 */
export function viewportAround(lat: number, lng: number, zoom: number): ViewportBoundsLike {
  const z = Math.max(1, Math.min(20, zoom));
  const worldPx = 256 * 2 ** z;
  const viewW = typeof window !== "undefined" ? Math.min(Math.max(window.innerWidth, 320), 1400) : 390;
  const viewH =
    typeof window !== "undefined" ? Math.min(Math.max(window.innerHeight * 0.55, 280), 900) : 520;
  const lngSpan = (viewW / worldPx) * 360;
  const latSpan = (viewH / worldPx) * 360;
  return {
    sw_lat: Math.max(-85, lat - latSpan / 2),
    ne_lat: Math.min(85, lat + latSpan / 2),
    sw_lng: lng - lngSpan / 2,
    ne_lng: lng + lngSpan / 2,
    zoom: z
  };
}
