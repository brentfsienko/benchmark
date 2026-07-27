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

/** Wrap longitude into [-180, 180]. */
export function normalizeLng(lng: number): number {
  if (!Number.isFinite(lng)) return 0;
  let x = lng;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/**
 * Leaflet (esp. worldCopyJump / low zoom) can emit lng outside ±180.
 * Keep a valid API bbox; allow antimeridian (sw_lng > ne_lng).
 */
export function normalizeViewportBounds(bounds: ViewportBoundsLike): ViewportBoundsLike {
  const sw_lat = Math.max(-90, Math.min(90, bounds.sw_lat));
  const ne_lat = Math.max(-90, Math.min(90, bounds.ne_lat));
  const sw_lng = bounds.sw_lng;
  const ne_lng = bounds.ne_lng;

  const rawSpan = ne_lng - sw_lng;
  const wrappedSpan = sw_lng <= ne_lng ? rawSpan : 360 - (sw_lng - ne_lng);
  if (rawSpan >= 359 || wrappedSpan >= 359 || Math.abs(sw_lng) > 180 || Math.abs(ne_lng) > 180) {
    if (rawSpan >= 359 || wrappedSpan >= 359) {
      return {
        sw_lat: Math.min(sw_lat, ne_lat),
        ne_lat: Math.max(sw_lat, ne_lat),
        sw_lng: -180,
        ne_lng: 180,
        zoom: bounds.zoom
      };
    }
  }

  return {
    sw_lat: Math.min(sw_lat, ne_lat),
    ne_lat: Math.max(sw_lat, ne_lat),
    sw_lng: normalizeLng(sw_lng),
    ne_lng: normalizeLng(ne_lng),
    zoom: bounds.zoom
  };
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
  const lngSpan = Math.min((viewW / worldPx) * 360, 360);
  const latSpan = Math.min((viewH / worldPx) * 360, 170);

  if (lngSpan >= 359) {
    return {
      sw_lat: Math.max(-85, lat - latSpan / 2),
      ne_lat: Math.min(85, lat + latSpan / 2),
      sw_lng: -180,
      ne_lng: 180,
      zoom: z
    };
  }

  const centerLng = normalizeLng(lng);
  return normalizeViewportBounds({
    sw_lat: Math.max(-85, lat - latSpan / 2),
    ne_lat: Math.min(85, lat + latSpan / 2),
    sw_lng: centerLng - lngSpan / 2,
    ne_lng: centerLng + lngSpan / 2,
    zoom: z
  });
}
