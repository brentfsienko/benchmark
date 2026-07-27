import { createSupabaseAdmin, hasSupabase } from "@/src/lib/supabase/admin";
import { getRequestActor } from "@/src/lib/request-auth";
import type {
  BenchPin,
  Challenge,
  FriendChallengeProgress,
  LeaderboardEntry,
} from "@/src/lib/types";

const GREEN_LAKE_CHALLENGE_ID = "challenge-gl-summer-2025";
const GREEN_LAKE_COMPLETION_TARGET = 8;

export type BenchWithStatus = BenchPin & {
  benchmarked: boolean;
  reviewCount: number;
  topPhoto?: string;
};

export type ChallengePageData = {
  profileId: string | null;
  allChallenges: Challenge[];
  greenLakeChallenge: Challenge | null;
  leaderboard: LeaderboardEntry[];
  benchList: BenchWithStatus[];
  joined: boolean;
  friendProgress: FriendChallengeProgress[];
};

export async function loadChallengeData(): Promise<ChallengePageData> {
  if (!hasSupabase()) {
    return empty(null);
  }

  const actor = await getRequestActor();
  const profileId = actor?.profileId ?? null;
  const supabase = createSupabaseAdmin();

  const [challengeRes, leaderboardData, pinsRes] = await Promise.all([
    supabase
      .from("challenges")
      .select("id, park_id, title, description, starts_at, ends_at, points_per_benchmark, is_active")
      .order("starts_at", { ascending: false }),
    loadLeaderboard(supabase, "green-lake"),
    supabase.rpc("list_bench_pins", {
      p_sw_lat: 47.674,
      p_sw_lng: -122.345,
      p_ne_lat: 47.686,
      p_ne_lng: -122.325,
      p_min_rating: null,
    }),
  ]);

  const allChallenges: Challenge[] = (challengeRes.data ?? []).map(toChallenge);
  const gl = allChallenges.find((c) => c.id === GREEN_LAKE_CHALLENGE_ID || c.parkId === "green-lake") ?? null;

  const top8: BenchPin[] = (pinsRes.data ?? []).slice(0, 8).map((r: Record<string, unknown>) => {
    const rawTags = r.tags;
    const tags: string[] = Array.isArray(rawTags) ? rawTags.map((t) => String(t)) : [];
    return {
      id: String(r.id),
      name: String(r.name),
      neighborhood: String(r.neighborhood),
      type: String(r.bench_type),
      averageRating: Number(r.average_rating),
      reviewCount: Number(r.review_count ?? 0),
      latitude: Number(r.lat),
      longitude: Number(r.lng),
      tags,
    };
  });

  const benchIds = top8.map((b) => b.id);

  const [profileRes, summaryCountRes, friendRows] = await Promise.all([
    profileId
      ? supabase.from("bench_reviews").select("bench_id").eq("user_id", profileId).in("bench_id", benchIds)
      : Promise.resolve({ data: null }),
    benchIds.length > 0
      ? supabase.from("bench_reviews").select("bench_id").in("bench_id", benchIds)
      : Promise.resolve({ data: null }),
    gl && profileId
      ? loadFriendsProgress(supabase, gl.id, profileId)
      : Promise.resolve([] as FriendChallengeProgress[]),
  ]);

  const bmSet = new Set(
    (profileRes.data ?? []).map((r: { bench_id: string }) => r.bench_id)
  );

  const countMap: Record<string, number> = {};
  for (const r of summaryCountRes.data ?? []) {
    const bid = String((r as { bench_id: string }).bench_id);
    countMap[bid] = (countMap[bid] ?? 0) + 1;
  }

  const benchList: BenchWithStatus[] = top8
    .map((b) => ({
      ...b,
      benchmarked: bmSet.has(b.id),
      reviewCount: countMap[b.id] ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const joined = leaderboardData.some((e) => e.userId === profileId);

  return {
    profileId,
    allChallenges,
    greenLakeChallenge: gl,
    leaderboard: leaderboardData,
    benchList,
    joined,
    friendProgress: friendRows,
  };
}

function toChallenge(c: Record<string, unknown>): Challenge {
  return {
    id: String(c.id),
    parkId: String(c.park_id),
    title: String(c.title),
    description: String(c.description ?? ""),
    startsAt: new Date(String(c.starts_at)).toISOString(),
    endsAt: new Date(String(c.ends_at)).toISOString(),
    pointsPerBenchmark: Number(c.points_per_benchmark ?? 10),
    isActive: Boolean(c.is_active),
  };
}

type SupabaseClient = ReturnType<typeof createSupabaseAdmin>;

async function loadLeaderboard(supabase: SupabaseClient, parkId: string): Promise<LeaderboardEntry[]> {
  const { data: challenges } = await supabase
    .from("challenges").select("id").eq("park_id", parkId).eq("is_active", true);

  const challengeIds = (challenges ?? []).map((c: { id: string }) => c.id);
  if (challengeIds.length === 0) return [];

  const { data: allParticipants } = await supabase
    .from("challenge_participants")
    .select("user_id, points, progress_count")
    .in("challenge_id", challengeIds)
    .order("points", { ascending: false });

  const byUser = (allParticipants ?? []).reduce(
    (acc: Record<string, { points: number; progress: number }>, p: { user_id: string; points: number; progress_count: number }) => {
      if (!acc[p.user_id]) acc[p.user_id] = { points: 0, progress: 0 };
      acc[p.user_id].points += p.points;
      acc[p.user_id].progress += p.progress_count;
      return acc;
    },
    {},
  );

  const sorted = Object.entries(byUser)
    .map(([userId, { points, progress }]) => ({ userId, points, progress }))
    .sort((a, b) => b.points - a.points);

  const userIds = sorted.map((s) => s.userId);
  let userMap: Record<string, { displayName: string; username: string }> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, display_name, username").in("id", userIds);
    userMap = (users ?? []).reduce(
      (acc: Record<string, { displayName: string; username: string }>, u: { id: string; display_name: string; username: string }) => {
        acc[u.id] = { displayName: u.display_name, username: u.username };
        return acc;
      },
      {},
    );
  }

  return sorted.map((s, i) => ({
    userId: s.userId,
    displayName: userMap[s.userId]?.displayName,
    username: userMap[s.userId]?.username,
    points: s.points,
    progress: s.progress,
    rank: i + 1,
  }));
}

async function loadFriendsProgress(supabase: SupabaseClient, challengeId: string, profileId: string): Promise<FriendChallengeProgress[]> {
  const [followingRes, followersRes] = await Promise.all([
    supabase.from("user_follows").select("following_id").eq("follower_id", profileId),
    supabase.from("user_follows").select("follower_id").eq("following_id", profileId),
  ]);
  if (followingRes.error || followersRes.error) return [];

  const following = new Set((followingRes.data ?? []).map((r: { following_id: string }) => r.following_id));
  const followers = new Set((followersRes.data ?? []).map((r: { follower_id: string }) => r.follower_id));
  const friendIds = [...following].filter((uid) => followers.has(uid));
  if (friendIds.length === 0) return [];

  const [participantsRes, usersRes] = await Promise.all([
    supabase.from("challenge_participants").select("user_id, points, progress_count").eq("challenge_id", challengeId).in("user_id", friendIds),
    supabase.from("users").select("id, display_name, username").in("id", friendIds),
  ]);
  if (participantsRes.error || usersRes.error) return [];

  const userMap = (usersRes.data ?? []).reduce(
    (acc: Record<string, { displayName: string; username: string }>, u: { id: string; display_name: string; username: string }) => {
      acc[u.id] = { displayName: u.display_name, username: u.username };
      return acc;
    },
    {},
  );

  const rows: FriendChallengeProgress[] = (participantsRes.data ?? []).map((p: { user_id: string; points: number; progress_count: number }) => {
    const progress = Number(p.progress_count ?? 0);
    return {
      userId: p.user_id,
      displayName: userMap[p.user_id]?.displayName ?? "friend",
      username: userMap[p.user_id]?.username ?? "",
      points: Number(p.points ?? 0),
      progress,
      started: progress > 0 || Number(p.points ?? 0) > 0,
      completed: progress >= GREEN_LAKE_COMPLETION_TARGET,
    };
  });

  rows.sort((a, b) => {
    if (b.completed !== a.completed) return Number(b.completed) - Number(a.completed);
    return b.points - a.points;
  });
  return rows;
}

function empty(profileId: string | null): ChallengePageData {
  return {
    profileId,
    allChallenges: [],
    greenLakeChallenge: null,
    leaderboard: [],
    benchList: [],
    joined: false,
    friendProgress: [],
  };
}
