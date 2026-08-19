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
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  if (!loading && session) {
    return <Navigate to="/events" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      if (error) {
        setMessage("Could not create the account.");
        return;
      }
      setMessage(
        "Account created. If email confirmation is enabled, check your inbox, then ask an admin to add you to admin_users.",
      );
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage("Sign in failed. Check the email and password.");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md border border-line bg-card p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-teal">SimBox</p>
        <h1 className="font-serif mt-2 text-3xl text-ink">Analytics sign in</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Administrators only. Learner activity is collected anonymously and is not shown here
          until you are authorized.
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
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-teal-deep underline-offset-2 hover:underline"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setMessage(null);
          }}
        >
          {mode === "signin" ? "Create an administrator account" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
}
