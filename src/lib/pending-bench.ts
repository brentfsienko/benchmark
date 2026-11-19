/**
 * A bench pin placed while signed out. Kept (for up to an hour, across tabs, so an email
 * confirmation link opened in a new tab still works) so that after signing in
 * (or creating an account) the visitor lands back on explore with the add form open.
 */

export const PENDING_BENCH_KEY = "benchmark:pendingBenchAdd";
/** Long enough to create an account and confirm the email; short enough to not resurface days later. */
export const PENDING_BENCH_MAX_AGE_MS = 60 * 60 * 1000;

export type PendingBench = { lat: number; lng: number };

type Stored = PendingBench & { savedAt: number };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function stashPendingBench(pin: PendingBench, now = Date.now()): void {
  try {
    storage()?.setItem(PENDING_BENCH_KEY, JSON.stringify({ lat: pin.lat, lng: pin.lng, savedAt: now }));
  } catch {
    // Private mode / quota: the visitor just re-places the pin.
  }
}

export function clearPendingBench(): void {
  try {
    storage()?.removeItem(PENDING_BENCH_KEY);
  } catch {
    // ignore
  }
}

/** Read and clear the stashed pin. Returns null if missing, malformed or stale. */
export function takePendingBench(now = Date.now()): PendingBench | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(PENDING_BENCH_KEY);
    store.removeItem(PENDING_BENCH_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const { lat, lng, savedAt } = parsed;
    if (typeof lat !== "number" || typeof lng !== "number" || typeof savedAt !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (now - savedAt > PENDING_BENCH_MAX_AGE_MS || now < savedAt) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
