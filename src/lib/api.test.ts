import { describe, expect, it, vi } from "vitest";
import { listNearbyBenches, searchPlaces } from "./api";

describe("listNearbyBenches", () => {
  it("serializes optional filters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    await listNearbyBenches({ minRating: 4, type: "park", radiusMeters: 500 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestURL = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestURL).toContain("minRating=4");
    expect(requestURL).toContain("type=park");
    expect(requestURL).toContain("radiusMeters=500");

    fetchMock.mockRestore();
  });
});

describe("searchPlaces", () => {
  const maptilerBody = {
    features: [{ id: "place.1", text: "Green Lake", place_name: "Green Lake, Seattle", center: [-122.33, 47.68] }]
  };

  it("geocodes straight from the browser with the public tiles key, rounding the bias point", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "pubkey");
    vi.stubGlobal("window", {});
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(maptilerBody), { status: 200 }));

    const places = await searchPlaces("green lake", { limit: 4, near: { lat: 47.68123, lng: -122.32876 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.host).toBe("api.maptiler.com");
    expect(url.searchParams.get("key")).toBe("pubkey");
    expect(url.searchParams.get("proximity")).toBe("-122.3,47.7");
    expect(places[0]).toMatchObject({ name: "Green Lake", label: "Seattle" });

    fetchMock.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to the server route when MapTiler refuses the key", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "pubkey");
    vi.stubGlobal("window", {});
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    await searchPlaces("paris", { near: { lat: 48.85, lng: 2.35 } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallback = String(fetchMock.mock.calls[1]?.[0]);
    expect(fallback).toContain("/places/search?");
    expect(fallback).toContain("lat=48.9");

    fetchMock.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
