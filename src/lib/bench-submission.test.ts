import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, parseBenchSubmission } from "./bench-submission";

const base = {
  name: "Lakeside Bench",
  neighborhood: "Green Lake",
  type: "wooden",
  description: "Sunset view",
  latitude: 47.68,
  longitude: -122.33
};

describe("parseBenchSubmission", () => {
  it("strips scores, rating and custom tags from non-admin submissions", () => {
    const result = parseBenchSubmission(
      { ...base, averageRating: 5, viewScore: 5, popularityScore: 5, remotenessScore: 5, tags: ["featured"] },
      { isAdmin: false }
    );
    expect(result).toEqual({
      ok: true,
      value: {
        ...base,
        viewScore: 0,
        remotenessScore: 0,
        popularityScore: 0,
        averageRating: 0,
        tags: ["user-submitted"]
      }
    });
  });

  it("keeps an admin's scores and tags", () => {
    const result = parseBenchSubmission({ ...base, averageRating: 4.5, viewScore: 3, tags: ["featured"] }, { isAdmin: true });
    expect(result.ok && result.value).toMatchObject({ averageRating: 4.5, viewScore: 3, tags: ["featured"] });
  });

  it("trims text and defaults the type to park", () => {
    const result = parseBenchSubmission({ ...base, name: "  Bench  ", type: "" }, { isAdmin: false });
    expect(result.ok && result.value).toMatchObject({ name: "Bench", type: "park" });
  });

  it.each([
    [{ name: "" }, "Name is required"],
    [{ neighborhood: "  " }, "Neighborhood is required"],
    [{ name: "x".repeat(MAX_NAME_LENGTH + 1) }, `Name must be ${MAX_NAME_LENGTH} characters or fewer`],
    [{ description: "x".repeat(501) }, "Description must be 500 characters or fewer"],
    [{ latitude: 91 }, "Latitude must be between -90 and 90"],
    [{ latitude: undefined }, "Latitude must be between -90 and 90"],
    [{ longitude: "abc" }, "Longitude must be between -180 and 180"]
  ])("rejects %o", (patch, error) => {
    expect(parseBenchSubmission({ ...base, ...patch }, { isAdmin: false })).toEqual({ ok: false, error });
  });

  it("rejects an empty body", () => {
    expect(parseBenchSubmission(null, { isAdmin: true })).toEqual({ ok: false, error: "Name is required" });
  });
});
