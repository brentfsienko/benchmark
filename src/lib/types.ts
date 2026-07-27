export type Bench = {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  description: string;
  viewScore: number;
  remotenessScore: number;
  popularityScore: number;
  averageRating: number;
  distanceMeters: number;
  latitude: number;
  longitude: number;
  tags: string[];
  parkName?: string | null;
  siteName?: string | null;
  category?: string | null;
  material?: string | null;
  lengthFt?: number | null;
  yearInstalled?: string | null;
  donorPlaque?: string | null;
  photoUrls?: string[];
};

export type BenchPin = {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  averageRating: number;
  reviewCount: number;
  latitude: number;
  longitude: number;
  /** Filterable facet tags: park, memorial, historic, etc. */
  tags: string[];
};

export type BenchReview = {
  id: string;
  benchId: string;
  userId: string;
  author: string;
  rating: number;
  body: string;
  photoBase64Items?: string[];
  createdAt: string;
};

export type UserProfile = {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  isPublic: boolean;
  avatarSymbol?: string;
  avatarPhotoURL?: string;
  avatarPhotoBase64?: string;
  benchmarkedBenchIDs: string[];
  benchmarkCount?: number;
  wishlistBenchIDs: string[];
};

export type ActivityItem = {
  id: string;
  type: "benchmark";
  userId: string;
  author?: string;
  benchId: string;
  benchName: string;
  rating?: number;
  createdAt: string;
};

export type Challenge = {
  id: string;
  parkId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  pointsPerBenchmark: number;
  isActive: boolean;
};

export type LeaderboardEntry = {
  userId: string;
  displayName?: string;
  username?: string;
  points: number;
  progress: number;
  rank: number;
};

export type FollowRelationshipState = "none" | "requested" | "following";

export type FollowRequests = {
  incoming: string[];
  outgoing: string[];
};

export type FriendChallengeProgress = {
  userId: string;
  displayName: string;
  username: string;
  progress: number;
  points: number;
  started: boolean;
  completed: boolean;
};
