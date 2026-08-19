import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage("Sign in failed. Use an invited administrator account.");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md border border-line bg-card p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-teal">SimBox</p>
        <h1 className="font-serif mt-2 text-3xl text-ink">Analytics sign in</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Invited administrators only. Accounts cannot be created from this page.
        </p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-line bg-paper px-3 py-2"
            />
          </label>
          {message ? (
            <p role="alert" className="text-sm text-ink">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-teal px-3 py-2.5 text-sm font-medium text-card disabled:opacity-60"
          >
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
