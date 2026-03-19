export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_BENCHMARK_API_BASE_URL ?? "",
  currentUserID: process.env.NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID ?? "user-1"
};

export function getApiBaseUrl(): string {
  const base = env.apiBaseUrl.trim();
  if (base) return base.replace(/\/$/, "");
  return "/api/v1";
}
