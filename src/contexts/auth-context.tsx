"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/src/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  profileId: string | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const ADMIN_EMAIL = "brentfsienko@gmail.com";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profileId: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me");
      const json = await res.json();
      const id = json?.data?.profileId ?? process.env.NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID ?? "user-1";
      setProfileId(id);
    } catch {
      setProfileId(process.env.NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID ?? "user-1");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
      fetchProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      fetchProfile();
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setProfileId(process.env.NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID ?? "user-1");
    window.location.href = "/";
  }, []);

  const isAdmin = user?.email === ADMIN_EMAIL;

  return (
    <AuthContext.Provider value={{ user, profileId, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
