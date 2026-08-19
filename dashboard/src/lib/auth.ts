import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  adminName: string | null;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
