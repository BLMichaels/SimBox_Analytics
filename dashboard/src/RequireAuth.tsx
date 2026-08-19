import { Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./lib/auth";
import { NotAuthorizedPage } from "./pages/NotAuthorizedPage";

export function RequireAuth() {
  const { loading, session, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-paper text-sm text-ink-soft">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <NotAuthorizedPage />;
  return <AppShell />;
}
