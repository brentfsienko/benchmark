import { describe, expect, it } from "vitest";
import {
  normalizeLng,
  normalizeViewportBounds,
  padViewportBounds,
  type ViewportBoundsLike
} from "./map-view";

/** The explore page's padBounds before world-span handling, kept to pin down "unchanged" behaviour. */
function legacyPadBounds(bounds: ViewportBoundsLike, factor: number): ViewportBoundsLike {
  const latSpan = Math.max(bounds.ne_lat - bounds.sw_lat, 0.0001);
  const crosses = bounds.sw_lng > bounds.ne_lng;
  const lngSpan = crosses
    ? Math.max(180 - bounds.sw_lng + (bounds.ne_lng + 180), 0.0001)
    : Math.max(bounds.ne_lng - bounds.sw_lng, 0.0001);
  const latPad = latSpan * factor;
  const lngPad = lngSpan * factor;
  let sw_lng = bounds.sw_lng - lngPad;
  let ne_lng = bounds.ne_lng + lngPad;
  if (!crosses) {
    if (sw_lng < -180) sw_lng += 360;
    if (ne_lng > 180) ne_lng -= 360;
  }
  return {
    sw_lat: Math.max(-90, bounds.sw_lat - latPad),
    ne_lat: Math.min(90, bounds.ne_lat + latPad),
    sw_lng,
    ne_lng,
    zoom: bounds.zoom
  };
}

const WORLD = { sw_lng: -180, ne_lng: 180 };

describe("normalizeViewportBounds", () => {
  it("passes the zoom-2 explore request through unchanged", () => {
    // /api/v1/benches/pins?sw_lat=-90&sw_lng=-131.6602&ne_lat=90&ne_lng=132.0117&zoom=2
    const b = { sw_lat: -90, sw_lng: -131.6602, ne_lat: 90, ne_lng: 132.0117, zoom: 2 };
    expect(normalizeViewportBounds(b)).toEqual(b);
  });

  it("collapses a Leaflet view wider than the world to -180..180", () => {
    // 1400px-wide map at zoom 2: the 1024px world repeats past both edges.
    expect(
      normalizeViewportBounds({ sw_lat: -84, sw_lng: -246.1, ne_lat: 84, ne_lng: 246.1, zoom: 2 })
    ).toEqual({ sw_lat: -84, ne_lat: 84, ...WORLD, zoom: 2 });
  });

  it("wraps a worldCopyJump view back into ±180 and clamps latitude", () => {
    expect(
      normalizeViewportBounds({ sw_lat: -95, sw_lng: -482.5, ne_lat: 47.7, ne_lng: -462.5, zoom: 4 })
    ).toEqual({ sw_lat: -90, ne_lat: 47.7, sw_lng: -122.5, ne_lng: -102.5, zoom: 4 });
  });
});

describe("padViewportBounds", () => {
  it("pads a zoomed-in Seattle viewport on every side", () => {
    const b = { sw_lat: 47.6, sw_lng: -122.4, ne_lat: 47.7, ne_lng: -122.2, zoom: 13 };
    const padded = padViewportBounds(b, 0.5);
    expect(padded.sw_lat).toBeCloseTo(47.55, 10);
    expect(padded.ne_lat).toBeCloseTo(47.75, 10);
    expect(padded.sw_lng).toBeCloseTo(-122.5, 10);
    expect(padded.ne_lng).toBeCloseTo(-122.1, 10);
    expect(padded.zoom).toBe(13);
  });

  it("wraps padding past the antimeridian into a crossing box", () => {
    const padded = padViewportBounds({ sw_lat: -20, sw_lng: 160, ne_lat: -10, ne_lng: 175 }, 0.5);
    expect(padded.sw_lng).toBeCloseTo(152.5, 10);
    expect(padded.ne_lng).toBeCloseTo(-177.5, 10);
  });

  it("keeps a whole-world view whole instead of folding it to 0..0", () => {
    const padded = padViewportBounds({ sw_lat: -84, ne_lat: 84, ...WORLD, zoom: 2 }, 0.5);
    expect(padded).toEqual({ sw_lat: -90, ne_lat: 90, ...WORLD, zoom: 2 });
  });

  it("widens a >180° view to the world instead of a Pacific sliver", () => {
    // Desktop at zoom 3. The old padding returned 114..-114 (132° across the Pacific).
    const b = { sw_lat: -60, sw_lng: -123, ne_lat: 60, ne_lng: 123, zoom: 3 };
    expect(legacyPadBounds(b, 0.5)).toMatchObject({ sw_lng: 114, ne_lng: -114 });
    expect(padViewportBounds(b, 0.5)).toEqual({ sw_lat: -90, ne_lat: 90, ...WORLD, zoom: 3 });
  });

  it("goes world-wide once an antimeridian-crossing view pads past 360°", () => {
    const padded = padViewportBounds({ sw_lat: 0, sw_lng: -100, ne_lat: 10, ne_lng: -120 }, 0.5);
    expect(padded).toMatchObject(WORLD);
  });

  it("matches the old padding for every view that stays under 360°", () => {
    let compared = 0;
    for (const factor of [0.35, 0.5, 0.75]) {
      for (const span of [0.004, 0.05, 0.5, 5, 30, 90, 140]) {
        if (span * (1 + 2 * factor) >= 360) continue;
        for (let centerLng = -179; centerLng <= 179; centerLng += 13) {
          for (const centerLat of [-60, -10, 0, 33, 47.6]) {
            const b = {
              sw_lat: centerLat - span / 4,
              ne_lat: centerLat + span / 4,
              sw_lng: normalizeLng(centerLng - span / 2),
              ne_lng: normalizeLng(centerLng + span / 2),
              zoom: 10
            };
            expect(padViewportBounds(b, factor)).toEqual(legacyPadBounds(b, factor));
            compared++;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it("gives the pins API a world box for a desktop world view end to end", () => {
    // explore-map pushBounds → explore page padding → listBenchPins.
    const view = normalizeViewportBounds({ sw_lat: -84, sw_lng: -246.1, ne_lat: 84, ne_lng: 246.1, zoom: 2 });
    const sent = normalizeViewportBounds(padViewportBounds(view, 0.5));
    expect(sent).toEqual({ sw_lat: -90, ne_lat: 90, ...WORLD, zoom: 2 });
  });
});
