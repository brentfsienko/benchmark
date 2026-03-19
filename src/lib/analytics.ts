type EventPayload = {
  name: string;
  userId?: string;
  benchId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const eventQueue: EventPayload[] = [];

export function trackEvent(payload: EventPayload): void {
  eventQueue.push(payload);
  const apiBase = process.env.NEXT_PUBLIC_BENCHMARK_API_BASE_URL ?? "/api/v1";
  const eventsUrl = apiBase ? `${apiBase.replace(/\/$/, "")}/events` : "/api/v1/events";
  fetch(eventsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: payload.name,
        userId: payload.userId ?? "",
        benchId: payload.benchId ?? "",
        metadata: payload.metadata ?? {},
        source: "web"
      })
    }).catch(() => {
    // Keep analytics fire-and-forget.
  });
  if (process.env.NODE_ENV !== "production") {
    // Keep visibility in local testing while we wire backend ingest.
    console.log("analytics:event", payload);
  }
}

export function getQueuedEventsForTesting(): EventPayload[] {
  return [...eventQueue];
}
