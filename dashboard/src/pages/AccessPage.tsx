import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { callAdminFunction } from "../lib/adminApi";
import { logAudit, readAuditLog, type AuditEntry } from "../lib/auditLog";
import { formatLocal } from "../lib/dates";
import { useAuth } from "../lib/auth";

type AdminRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
};

export function AccessPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<AdminRow | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>(() => readAuditLog());

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await callAdminFunction<{ admins: AdminRow[] }>("admin-manage-access", {
        action: "list",
      });
      setAdmins(data.admins ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load administrators.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await callAdminFunction<{ invited?: boolean; existing?: boolean }>(
        "admin-manage-access",
        { action: "invite", email, display_name: displayName },
      );
      logAudit(user?.email ?? "", "invite_admin", email);
      setAudit(readAuditLog());
      setEmail("");
      setDisplayName("");
      setNotice(
        result.existing
          ? "That person already had an account. They now have dashboard access."
          : "Invite sent. They will receive an email to set a password and sign in.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to invite that person.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revoke) return;
    setBusy(true);
    setError(null);
    try {
      await callAdminFunction("admin-manage-access", { action: "revoke", user_id: revoke.user_id });
      logAudit(user?.email ?? "", "revoke_admin", revoke.email || revoke.user_id);
      setAudit(readAuditLog());
      setRevoke(null);
      setNotice("Access removed. They can no longer open the dashboard.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-6 border-b border-ink pb-5">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Administration</p>
        <h1 className="font-serif mt-1 text-3xl text-ink">Access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
          Invite colleagues by email. The public sign-in page does not create accounts. Only people
          listed here can see usage data.
        </p>
      </header>

      <form className="mb-8 grid gap-3 border border-line bg-card p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => void onInvite(e)}>
        <label className="text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full border border-line bg-paper px-3 py-2"
          />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className="w-full bg-ink px-4 py-2 text-sm text-card disabled:opacity-60 md:w-auto">
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      {notice ? (
        <p role="status" className="mb-4 text-sm text-ok">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="border border-line bg-card">
        <header className="border-b border-line px-4 py-3">
          <h2 className="font-serif text-lg text-ink">Administrators</h2>
        </header>
        <ul className="divide-y divide-line">
          {admins.map((admin) => {
            const isYou = admin.user_id === user?.id;
            return (
              <li key={admin.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">
                    {admin.display_name || admin.email || "Administrator"}
                    {isYou ? <span className="ml-2 text-xs font-normal text-ink-soft">you</span> : null}
                  </p>
                  <p className="font-mono text-xs text-ink-soft">{admin.email || admin.user_id}</p>
                  <p className="text-[11px] text-ink-soft">Added {formatLocal(admin.created_at)}</p>
                </div>
                <button
                  type="button"
                  disabled={busy || admins.length <= 1}
                  className="border border-danger px-3 py-1.5 text-sm text-danger disabled:opacity-40"
                  onClick={() => setRevoke(admin)}
                >
                  Remove access
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8 border border-line bg-card">
        <header className="border-b border-line px-4 py-3">
          <h2 className="font-serif text-lg text-ink">Action log on this browser</h2>
          <p className="mt-1 text-[11px] text-ink-soft">
            Invites, access removals, case changes, and event deletions from this machine. This is a
            local research trail, not a server-side IRB archive.
          </p>
        </header>
        {audit.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">No local admin actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {audit.slice(0, 40).map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="px-4 py-2">
                <p className="font-medium text-ink">
                  {entry.action.replaceAll("_", " ")} · {entry.actor}
                </p>
                <p className="text-xs text-ink-soft">
                  {formatLocal(entry.at)} · {entry.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revoke ? (
        <ConfirmDialog
          title="Remove dashboard access?"
          body={`${revoke.email || revoke.display_name || "This administrator"} will no longer be able to sign in to analytics.`}
          confirmLabel={busy ? "Removing…" : "Remove access"}
          onConfirm={() => {
            if (!busy) void confirmRevoke();
          }}
          onCancel={() => {
            if (!busy) setRevoke(null);
          }}
        />
      ) : null}
    </div>
  );
}
