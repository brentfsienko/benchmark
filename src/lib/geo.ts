/** Max distance from a bench to submit a benchmark.
 *  40m is tight enough to require being at the sit, but forgiving of typical phone GPS error. */
export const BENCHMARK_GEOFENCE_METERS = 40;

const EARTH_RADIUS_METERS = 6_371_000;

export type LatLng = {
  latitude: number;
  longitude: number;
};

/** Great-circle distance between two WGS84 points, in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinGeofence(
  user: LatLng,
  bench: LatLng,
  radiusMeters: number = BENCHMARK_GEOFENCE_METERS
): boolean {
  return distanceMeters(user, bench) <= radiusMeters;
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 10) return `${Math.round(meters)}m`;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
