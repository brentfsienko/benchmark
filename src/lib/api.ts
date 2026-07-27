import { env, getApiBaseUrl } from "./env";
import type {
  ActivityItem,
  Bench,
  BenchPin,
  BenchReview,
  Challenge,
  FriendChallengeProgress,
  FollowRelationshipState,
  FollowRequests,
  LeaderboardEntry,
  UserProfile
} from "./types";

type APIResponse<T> = {
  data: T;
};

class APIError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path.startsWith("/") ? "" : "/"}${path}` : path;
  const method = (init?.method ?? "GET").toUpperCase();
  // GETs respect Cache-Control from the API (pins/challenges/etc.). Mutations stay fresh.
  const cache: RequestCache =
    init?.cache ?? (method === "GET" ? "default" : "no-store");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache
  });
  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message ?? message;
    } catch {
      // Intentionally ignore parse errors and keep generic message.
    }
    throw new APIError(response.status, message);
  }
  const payload = (await response.json()) as APIResponse<T>;
  return payload.data;
}

export type NearbyBenchFilters = {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  minRating?: number;
  minViewScore?: number;
  minRemotenessScore?: number;
  type?: string;
};

export async function listNearbyBenches(filters: NearbyBenchFilters): Promise<Bench[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  return request<Bench[]>(`/benches/nearby?${params.toString()}`);
}

export type BenchPinBounds = {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
  zoom?: number;
};

export async function listBenchPins(
  bounds: BenchPinBounds,
  minRating?: number,
  init?: { signal?: AbortSignal }
): Promise<BenchPin[]> {
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const params = new URLSearchParams({
    sw_lat: String(round4(bounds.sw_lat)),
    sw_lng: String(round4(bounds.sw_lng)),
    ne_lat: String(round4(bounds.ne_lat)),
    ne_lng: String(round4(bounds.ne_lng))
  });
  if (minRating !== undefined && minRating !== null) {
    params.set("minRating", String(minRating));
  }
  if (bounds.zoom !== undefined && bounds.zoom !== null) {
    params.set("zoom", String(Math.round(bounds.zoom)));
  }
  // Allow short CDN cache from the API; still bypasses local Next fetch cache for mutations via refresh.
  return request<BenchPin[]>(`/benches/pins?${params.toString()}`, {
    signal: init?.signal
  });
}

export function searchBenches(query: string, limit = 20): Promise<BenchPin[]> {
  const q = query.trim();
  if (q.length < 2) return Promise.resolve([]);
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request<BenchPin[]>(`/benches/search?${params.toString()}`);
}

export function getBench(benchID: string): Promise<Bench> {
  return request<Bench>(`/benches/${benchID}`, { cache: "no-store" });
}

export type BenchSummary = { benchId: string; reviewCount: number; topPhoto: string | null };

export function getBenchSummaries(benchIds: string[]): Promise<BenchSummary[]> {
  if (benchIds.length === 0) return Promise.resolve([]);
  return request<BenchSummary[]>(`/benches/summaries?ids=${benchIds.join(",")}`);
}

export type BenchCard = {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  averageRating: number;
};

export function listBenchCards(benchIds: string[]): Promise<BenchCard[]> {
  if (benchIds.length === 0) return Promise.resolve([]);
  return request<BenchCard[]>(`/benches/cards?ids=${benchIds.join(",")}`);
}

export function listBenchReviews(
  benchID: string,
  options?: { lite?: boolean }
): Promise<BenchReview[]> {
  const suffix = options?.lite ? "?lite=1" : "";
  return request<BenchReview[]>(`/benches/${benchID}/reviews${suffix}`, { cache: "no-store" });
}

export function createBench(payload: Partial<Bench>): Promise<Bench> {
  return request<Bench>("/benches", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateBenchLocation(benchID: string, latitude: number, longitude: number): Promise<Bench> {
  return request<Bench>(`/benches/${benchID}`, {
    method: "PATCH",
    body: JSON.stringify({ latitude, longitude })
  });
}

export function updateBench(
  benchID: string,
  patch: { name?: string; description?: string; neighborhood?: string }
): Promise<Bench> {
  return request<Bench>(`/benches/${benchID}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export function deleteBench(benchID: string): Promise<{ id: string; name: string; deleted: boolean }> {
  return request<{ id: string; name: string; deleted: boolean }>(`/benches/${benchID}`, {
    method: "DELETE"
  });
}

export async function submitBenchmark(
  benchID: string,
  payload: {
    rating: number;
    body: string;
    photoBase64Items?: string[];
    userId?: string;
    latitude: number;
    longitude: number;
  }
): Promise<void> {
  const userId = payload.userId ?? env.currentUserID;
  await request<unknown>(`/benches/${benchID}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      userId,
      rating: payload.rating,
      body: payload.body,
      photoBase64Items: payload.photoBase64Items ?? [],
      latitude: payload.latitude,
      longitude: payload.longitude
    })
  });
}

export function getProfile(userID: string, options?: { slim?: boolean }): Promise<UserProfile> {
  const suffix = options?.slim ? "?slim=1" : "";
  return request<UserProfile>(`/users/${userID}/profile${suffix}`, { cache: "no-store" });
}

export function completeOnboarding(userID: string): Promise<{ onboardingComplete: boolean }> {
  return request<{ onboardingComplete: boolean }>(`/users/${userID}/onboarding`, {
    method: "POST"
  });
}

export function updateProfile(
  userID: string,
  payload: Partial<Pick<UserProfile, "displayName" | "username" | "bio" | "isPublic" | "avatarPhotoURL" | "avatarPhotoBase64">>
): Promise<UserProfile> {
  return request<UserProfile>(`/users/${userID}/profile`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function listActivity(userID: string, options?: { feed?: boolean }): Promise<ActivityItem[]> {
  const suffix = options?.feed ? "?feed=true" : "";
  return request<ActivityItem[]>(`/users/${userID}/activity${suffix}`, { cache: "no-store" });
}

export function listWishlist(userID: string): Promise<string[]> {
  return request<string[]>(`/users/${userID}/wishlist`, { cache: "no-store" });
}

export function addWishlistItem(userID: string, benchID: string): Promise<void> {
  return request<void>(`/users/${userID}/wishlist`, {
    method: "POST",
    body: JSON.stringify({ benchId: benchID })
  });
}

export function removeWishlistItem(userID: string, benchID: string): Promise<void> {
  return request<void>(`/users/${userID}/wishlist/${benchID}`, {
    method: "DELETE"
  });
}

export function listFollowers(userID: string): Promise<string[]> {
  return request<string[]>(`/users/${userID}/followers`, { cache: "no-store" });
}

export function listFollowing(userID: string): Promise<string[]> {
  return request<string[]>(`/users/${userID}/following`, { cache: "no-store" });
}

export function followUser(_followerId: string, targetId: string): Promise<{ state: FollowRelationshipState }> {
  return request<{ state: FollowRelationshipState }>(`/users/${targetId}/follow`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function unfollowUser(_followerId: string, targetId: string): Promise<{ state: FollowRelationshipState }> {
  return request<{ state: FollowRelationshipState }>(`/users/${targetId}/unfollow`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function listFollowRequests(userID: string): Promise<FollowRequests> {
  return request<FollowRequests>(`/users/${userID}/follow-requests`, { cache: "no-store" });
}

export function decideFollowRequest(
  userID: string,
  otherUserId: string,
  action: "approve" | "reject" | "cancel"
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/users/${userID}/follow-requests`, {
    method: "POST",
    body: JSON.stringify({ otherUserId, action })
  });
}

export function readReady(): Promise<{ status: string }> {
  const base = getApiBaseUrl();
  const readyUrl = base && base !== "/api/v1" ? base.replace(/\/api\/v1$/, "") + "/ready" : "/api/ready";
  return fetch(readyUrl, { cache: "no-store" }).then((res) => {
    if (!res.ok) {
      throw new APIError(res.status, "Service is not ready.");
    }
    return res.json() as Promise<{ status: string }>;
  });
}

export function listChallenges(parkId?: string, includeInactive = false): Promise<Challenge[]> {
  const params = new URLSearchParams();
  if (parkId) params.set("parkId", parkId);
  if (includeInactive) params.set("includeInactive", "true");
  const suffix = params.toString();
  return request<Challenge[]>(`/challenges${suffix ? `?${suffix}` : ""}`);
}

export function joinChallenge(challengeID: string, userID: string): Promise<void> {
  return request<void>(`/challenges/${challengeID}/join`, {
    method: "POST",
    body: JSON.stringify({ userId: userID })
  });
}

export function recordChallengeProgress(challengeID: string, userID: string, benchmarksAdd = 1): Promise<void> {
  return request<void>(`/challenges/${challengeID}/progress`, {
    method: "POST",
    body: JSON.stringify({ userId: userID, benchmarksAdd })
  });
}

export function getParkLeaderboard(parkID: string): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(`/leaderboards/${parkID}`);
}

export function getChallengeFriendsProgress(challengeID: string): Promise<FriendChallengeProgress[]> {
  return request<FriendChallengeProgress[]>(`/challenges/${challengeID}/friends-progress`);
}

export function createContentReport(payload: {
  reporterUserId: string;
  targetType: string;
  targetId: string;
  reason: string;
}): Promise<{ id: string }> {
  return request<{ id: string }>("/reports", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getFeatureFlag(flagKey: string): Promise<{ flagKey: string; isEnabled: boolean }> {
  return request<{ flagKey: string; isEnabled: boolean }>(`/admin/feature-flags/${flagKey}`);
}

export function upsertFeatureFlag(flagKey: string, isEnabled: boolean): Promise<{ flagKey: string; isEnabled: boolean }> {
  return request<{ flagKey: string; isEnabled: boolean }>(`/admin/feature-flags/${flagKey}`, {
    method: "PUT",
    body: JSON.stringify({ isEnabled })
  });
}
