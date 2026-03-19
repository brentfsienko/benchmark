import { describe, expect, it, vi } from "vitest";
import { listNearbyBenches } from "./api";

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
