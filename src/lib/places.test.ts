import { describe, expect, it } from "vitest";
import { buildMapTilerGeocodingUrl, parseMapTilerGeocoding } from "./places";

describe("buildMapTilerGeocodingUrl", () => {
  it("encodes the query into the path and biases by proximity as lng,lat", () => {
    const url = new URL(
      buildMapTilerGeocodingUrl("Green Lake / Seattle", "k123", { limit: 4, proximity: { lat: 47.7, lng: -122.3 } })
    );
    expect(url.origin + url.pathname).toBe("https://api.maptiler.com/geocoding/Green%20Lake%20%2F%20Seattle.json");
    expect(url.searchParams.get("key")).toBe("k123");
    expect(url.searchParams.get("limit")).toBe("4");
    expect(url.searchParams.get("autocomplete")).toBe("true");
    expect(url.searchParams.get("proximity")).toBe("-122.3,47.7");
  });

  it("leaves proximity off when no center is known", () => {
    const url = new URL(buildMapTilerGeocodingUrl("Paris", "k"));
    expect(url.searchParams.has("proximity")).toBe(false);
    expect(url.searchParams.get("limit")).toBe("5");
  });
});

describe("parseMapTilerGeocoding", () => {
  it("maps features to places with a context label and bbox", () => {
    const places = parseMapTilerGeocoding({
      type: "FeatureCollection",
      features: [
        {
          id: "neighbourhood.123",
          text: "Green Lake",
          place_name: "Green Lake, Seattle, Washington, United States",
          center: [-122.3288, 47.6798],
          bbox: [-122.35, 47.67, -122.31, 47.69],
          place_type: ["neighbourhood"]
        }
      ]
    });
    expect(places).toEqual([
      {
        id: "neighbourhood.123",
        name: "Green Lake",
        label: "Seattle, Washington, United States",
        latitude: 47.6798,
        longitude: -122.3288,
        bbox: [-122.35, 47.67, -122.31, 47.69]
      }
    ]);
  });

  it("falls back to geometry coordinates and the first place_name part", () => {
    const [place] = parseMapTilerGeocoding({
      features: [{ id: 7, place_name: "1600 Pike Pl, Seattle", geometry: { coordinates: [-122.34, 47.61] } }]
    });
    expect(place).toMatchObject({ id: "7", name: "1600 Pike Pl", label: "Seattle", latitude: 47.61, longitude: -122.34 });
    expect(place.bbox).toBeUndefined();
  });

  it("treats a zero-area bbox as a point", () => {
    const [place] = parseMapTilerGeocoding({
      features: [{ id: "poi.1", text: "Gas Works Park", center: [-122.33, 47.64], bbox: [-122.33, 47.64, -122.33, 47.64] }]
    });
    expect(place.bbox).toBeUndefined();
  });

  it("keeps an antimeridian-crossing bbox (west > east)", () => {
    const [place] = parseMapTilerGeocoding({
      features: [{ id: "country.fj", text: "Fiji", center: [178, -17.8], bbox: [176.9, -19.2, -178.2, -16.1] }]
    });
    expect(place.bbox).toEqual([176.9, -19.2, -178.2, -16.1]);
  });

  it("drops malformed features and non-collections", () => {
    expect(parseMapTilerGeocoding(null)).toEqual([]);
    expect(parseMapTilerGeocoding({ message: "Invalid key" })).toEqual([]);
    expect(
      parseMapTilerGeocoding({
        features: [
          { id: "a", text: "No coords" },
          { id: "b", text: "Bad coords", center: ["x", 1] },
          { id: "c", text: "Off the globe", center: [10, 95] },
          { id: "d", center: [1, 1] }
        ]
      })
    ).toEqual([]);
  });
});
