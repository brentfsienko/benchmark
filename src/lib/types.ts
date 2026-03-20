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
  wishlistBenchIDs: string[];
};

export type ActivityItem = {
  id: string;
  type: "benchmark";
  userId: string;
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
  points: number;
  progress: number;
  rank: number;
};
