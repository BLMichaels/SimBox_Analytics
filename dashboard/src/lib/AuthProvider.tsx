import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthContext, type AuthState } from "./auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);

  const refreshAdmin = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setIsAdmin(false);
      setAdminName(null);
      return;
    }
    const { data, error } = await supabase
      .from("admin_users")
      .select("display_name, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      setIsAdmin(false);
      setAdminName(null);
      return;
    }
    setIsAdmin(true);
    setAdminName(data.display_name);
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void refreshAdmin(data.session?.user.id).finally(() => {
        if (mounted) setLoading(false);
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void refreshAdmin(next?.user.id);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshAdmin]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      isAdmin,
      adminName,
      signOut,
    }),
    [loading, session, isAdmin, adminName, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
