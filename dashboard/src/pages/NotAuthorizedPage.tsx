import { useAuth } from "../lib/auth";

export function NotAuthorizedPage() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-lg border border-line bg-card p-8">
        <h1 className="font-serif text-3xl text-ink">Not authorized</h1>
        <p className="mt-3 text-sm text-ink-soft">
          {user?.email} is signed in but is not listed as a SimBox analytics administrator.
          Ask an existing admin to add your user id to <code className="font-mono">admin_users</code>
          .
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 bg-ink px-4 py-2 text-sm text-card"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
