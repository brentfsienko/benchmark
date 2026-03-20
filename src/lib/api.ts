import { env, getApiBaseUrl } from "./env";
import type { ActivityItem, Bench, BenchReview, Challenge, LeaderboardEntry, UserProfile } from "./types";

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
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
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

export function getBench(benchID: string): Promise<Bench> {
  return request<Bench>(`/benches/${benchID}`);
}

export type BenchSummary = { benchId: string; reviewCount: number; topPhoto: string | null };

export function getBenchSummaries(benchIds: string[]): Promise<BenchSummary[]> {
  if (benchIds.length === 0) return Promise.resolve([]);
  return request<BenchSummary[]>(`/benches/summaries?ids=${benchIds.join(",")}`);
}

export function listBenchReviews(benchID: string): Promise<BenchReview[]> {
  return request<BenchReview[]>(`/benches/${benchID}/reviews`);
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

export async function submitBenchmark(
  benchID: string,
  payload: { rating: number; body: string; photoBase64Items?: string[]; userId?: string }
): Promise<void> {
  const userId = payload.userId ?? env.currentUserID;
  await request<unknown>(`/benches/${benchID}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      userId,
      rating: payload.rating,
      body: payload.body,
      photoBase64Items: payload.photoBase64Items ?? []
    })
  });
}

export function getProfile(userID: string): Promise<UserProfile> {
  return request<UserProfile>(`/users/${userID}/profile`);
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

export function listActivity(userID: string): Promise<ActivityItem[]> {
  return request<ActivityItem[]>(`/users/${userID}/activity`);
}

export function listWishlist(userID: string): Promise<string[]> {
  return request<string[]>(`/users/${userID}/wishlist`);
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
  return request<string[]>(`/users/${userID}/followers`);
}

export function listFollowing(userID: string): Promise<string[]> {
  return request<string[]>(`/users/${userID}/following`);
}

export function followUser(followerId: string, targetId: string): Promise<{ followed: boolean }> {
  return request<{ followed: boolean }>(`/users/${targetId}/follow`, {
    method: "POST",
    body: JSON.stringify({ followerId })
  });
}

export function unfollowUser(followerId: string, targetId: string): Promise<{ unfollowed: boolean }> {
  return request<{ unfollowed: boolean }>(`/users/${targetId}/unfollow`, {
    method: "POST",
    body: JSON.stringify({ followerId })
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
