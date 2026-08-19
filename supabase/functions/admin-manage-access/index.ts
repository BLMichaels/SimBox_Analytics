import { dashboardOrigin, json, requireDashboardAdmin } from "../_shared/adminHttp.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 80;

function clipName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const gate = await requireDashboardAdmin(req);
  if (!gate.ok) return gate.response;
  const origin = dashboardOrigin(req);

  let parsed: { action?: unknown; email?: unknown; display_name?: unknown; user_id?: unknown };
  try {
    parsed = (await req.json()) as typeof parsed;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const action = parsed.action;
  if (action === "list") {
    const { data: admins, error } = await gate.admin
      .from("admin_users")
      .select("user_id, display_name, role, created_at")
      .order("created_at");
    if (error) return json({ error: "Unable to load administrators" }, 500, origin);
    const { data: usersData } = await gate.admin.auth.admin.listUsers({ perPage: 200 });
    const emailById = new Map((usersData.users ?? []).map((u) => [u.id, u.email ?? ""]));
    return json(
      {
        ok: true,
        admins: (admins ?? []).map((row) => ({
          user_id: row.user_id,
          display_name: row.display_name,
          role: row.role,
          created_at: row.created_at,
          email: emailById.get(row.user_id) || "",
        })),
      },
      200,
      origin,
    );
  }

  if (action === "invite") {
    const email = String(parsed.email ?? "").trim().toLowerCase();
    const displayName = clipName(parsed.display_name) || email.split("@")[0] || "Administrator";
    if (!EMAIL_RE.test(email) || email.length > 120) {
      return json({ error: "Enter a valid email address." }, 400, origin);
    }
    const { data: invited, error: inviteError } = await gate.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/login`,
      data: { invited_by: gate.userId },
    });
    let userId = invited?.user?.id;
    let existing = false;
    if (inviteError || !userId) {
      const { data: usersData } = await gate.admin.auth.admin.listUsers({ perPage: 200 });
      const found = (usersData.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
      if (!found) {
        return json({ error: "Unable to invite that address." }, 400, origin);
      }
      userId = found.id;
      existing = true;
    }
    const { error: insertError } = await gate.admin.from("admin_users").upsert(
      { user_id: userId, display_name: displayName, role: "admin" },
      { onConflict: "user_id" },
    );
    if (insertError) {
      return json({ error: "Unable to grant access." }, 500, origin);
    }
    return json({ ok: true, invited: !existing, existing }, 200, origin);
  }

  if (action === "revoke") {
    const userId = String(parsed.user_id ?? "");
    if (!userId) return json({ error: "Invalid request" }, 400, origin);
    const { count } = await gate.admin.from("admin_users").select("user_id", { count: "exact", head: true });
    if ((count ?? 0) <= 1) {
      return json({ error: "Keep at least one administrator." }, 400, origin);
    }
    if (userId === gate.userId && (count ?? 0) <= 1) {
      return json({ error: "Keep at least one administrator." }, 400, origin);
    }
    const { error: delError } = await gate.admin.from("admin_users").delete().eq("user_id", userId);
    if (delError) return json({ error: "Unable to remove access." }, 500, origin);
    return json({ ok: true }, 200, origin);
  }

  return json({ error: "Invalid request" }, 400, origin);
});
