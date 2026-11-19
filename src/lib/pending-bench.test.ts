import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PENDING_BENCH_KEY,
  PENDING_BENCH_MAX_AGE_MS,
  clearPendingBench,
  stashPendingBench,
  takePendingBench
} from "./pending-bench";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v))
  };
}

describe("pending bench stash", () => {
  let store: Storage;

  beforeEach(() => {
    store = memoryStorage();
    vi.stubGlobal("window", { localStorage: store });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a pin once, then forgets it", () => {
    stashPendingBench({ lat: 47.68, lng: -122.33 }, 1_000);
    expect(takePendingBench(2_000)).toEqual({ lat: 47.68, lng: -122.33 });
    expect(takePendingBench(2_000)).toBeNull();
  });

  it("drops a pin older than an hour", () => {
    stashPendingBench({ lat: 1, lng: 2 }, 0);
    expect(takePendingBench(PENDING_BENCH_MAX_AGE_MS + 1)).toBeNull();
    expect(store.getItem(PENDING_BENCH_KEY)).toBeNull();
  });

  it("ignores malformed or out-of-range values", () => {
    store.setItem(PENDING_BENCH_KEY, "not json");
    expect(takePendingBench()).toBeNull();
    store.setItem(PENDING_BENCH_KEY, JSON.stringify({ lat: 95, lng: 0, savedAt: Date.now() }));
    expect(takePendingBench()).toBeNull();
    store.setItem(PENDING_BENCH_KEY, JSON.stringify({ lat: "1", lng: 0, savedAt: Date.now() }));
    expect(takePendingBench()).toBeNull();
  });

  it("can be cleared without taking", () => {
    stashPendingBench({ lat: 1, lng: 2 });
    clearPendingBench();
    expect(takePendingBench()).toBeNull();
  });

  it("is a no-op on the server", () => {
    vi.unstubAllGlobals();
    expect(() => stashPendingBench({ lat: 1, lng: 2 })).not.toThrow();
    expect(takePendingBench()).toBeNull();
  });
});
