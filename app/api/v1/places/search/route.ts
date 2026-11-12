import { NextRequest } from "next/server";
import { jsonCachedData, jsonError } from "@/src/lib/api-response";
import { buildMapTilerGeocodingUrl, parseMapTilerGeocoding, type PlaceResult } from "@/src/lib/places";

/** Geocode a free-text place query (city, neighborhood, address, park) for the explore map. */
export async function GET(request: NextRequest) {
  const key = process.env.MAPTILER_GEOCODING_KEY ?? process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
  if (!key) {
    return jsonError("Place search not configured", "internal_error", 503);
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const limitRaw = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, limitRaw)) : 5;

  if (q.length < 2) {
    return jsonCachedData([] as PlaceResult[], 300, 3600);
  }

  // Bias results toward where the map is looking. The client sends a coarse (~10 km) center.
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const proximity =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : undefined;

  try {
    const res = await fetch(buildMapTilerGeocodingUrl(q, key, { limit, proximity }), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) {
      console.error("places/search geocoder status:", res.status);
      return jsonError("Unable to search places", "upstream_error", 502);
    }
    const places = parseMapTilerGeocoding(await res.json());
    // Place names barely change; cache hard at the edge.
    return jsonCachedData(places, 3600, 86400);
  } catch (err) {
    console.error("places/search error:", err);
    return jsonError("Unable to search places", "upstream_error", 502);
  }
}
