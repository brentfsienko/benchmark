import { describe, expect, it } from "vitest";
import { getQueuedEventsForTesting, trackEvent } from "./analytics";

describe("analytics queue", () => {
  it("stores tracked events", () => {
    trackEvent({ name: "test_event", userId: "user-1", metadata: { count: 1 } });
    const events = getQueuedEventsForTesting();
    expect(events.some((item) => item.name === "test_event")).toBe(true);
  });
});
