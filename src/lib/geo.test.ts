import { describe, expect, it } from "vitest";
import {
  BENCHMARK_GEOFENCE_METERS,
  BENCH_CREATE_MIN_SPACING_METERS,
  distanceMeters,
  findNearestWithinRadius,
  formatDistanceMeters,
  isWithinGeofence
} from "./geo";

describe("distanceMeters", () => {
  it("returns ~0 for identical points", () => {
    const p = { latitude: 47.6298, longitude: -122.3142 };
    expect(distanceMeters(p, p)).toBeLessThan(0.01);
  });

  it("measures a short known offset near Seattle", () => {
    // ~111.2m per degree latitude
    const a = { latitude: 47.63, longitude: -122.314 };
    const b = { latitude: 47.63036, longitude: -122.314 }; // ~40m north
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(35);
    expect(d).toBeLessThan(45);
  });
});

describe("isWithinGeofence", () => {
  const bench = { latitude: 47.6298, longitude: -122.3142 };

  it("allows positions inside the default fence", () => {
    const nearby = { latitude: 47.62985, longitude: -122.3142 };
    expect(isWithinGeofence(nearby, bench)).toBe(true);
  });

  it("rejects positions outside the default fence", () => {
    const far = { latitude: 47.631, longitude: -122.3142 }; // ~130m
    expect(isWithinGeofence(far, bench)).toBe(false);
    expect(isWithinGeofence(far, bench, BENCHMARK_GEOFENCE_METERS)).toBe(false);
  });
});

describe("findNearestWithinRadius", () => {
  it("returns the closest bench inside the spacing radius", () => {
    const origin = { latitude: 47.6298, longitude: -122.3142 };
    const candidates = [
      { id: "far", latitude: 47.631, longitude: -122.3142, name: "far" },
      { id: "near", latitude: 47.62985, longitude: -122.3142, name: "near" }
    ];
    const hit = findNearestWithinRadius(origin, candidates, BENCH_CREATE_MIN_SPACING_METERS);
    expect(hit?.item.id).toBe("near");
  });

  it("returns null when nothing is within radius", () => {
    const origin = { latitude: 47.6298, longitude: -122.3142 };
    const candidates = [{ id: "far", latitude: 47.631, longitude: -122.3142, name: "far" }];
    expect(findNearestWithinRadius(origin, candidates, BENCH_CREATE_MIN_SPACING_METERS)).toBeNull();
  });
});

describe("formatDistanceMeters", () => {
  it("formats meters and kilometers", () => {
    expect(formatDistanceMeters(37)).toBe("37m");
    expect(formatDistanceMeters(1500)).toBe("1.5km");
  });
});
