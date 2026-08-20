const KEY = "simbox.adminAudit.v1";

export type AuditEntry = {
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export function readAuditLog(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function logAudit(actor: string, action: string, detail: string): void {
  const entry: AuditEntry = {
    at: new Date().toISOString(),
    actor: actor || "unknown",
    action,
    detail,
  };
  const next = [entry, ...readAuditLog()].slice(0, 200);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
