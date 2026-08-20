import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaseLink } from "../components/CaseLink";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type Column } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { TruncationNotice } from "../components/TruncationNotice";
import { logAudit } from "../lib/auditLog";
import { useAuth } from "../lib/auth";
import { formatPercent, formatRange } from "../lib/dates";
import { useStudyFilters } from "../lib/FilterProvider";
import { trackingHealth } from "../lib/reporting";
import { emptyExtract, loadStudyExtract, type StudyExtract } from "../lib/studyExtract";
import { supabase, trackingEndpoint } from "../lib/supabase";
import { useLiveReload } from "../lib/useLiveReload";
import type { CaseRecord } from "../lib/types";

type CaseRow = CaseRecord & {
  starts: number;
  completions: number;
  completion_rate: number;
  health: "ok" | "sparse" | "silent";
  checkpointRate: number;
};

export function CasesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { filters, setFilters, bounds, cases } = useStudyFilters();
  const [extract, setExtract] = useState<StudyExtract>(emptyExtract);
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftVersion, setDraftVersion] = useState("1.0.0");
  const [pendingDeactivate, setPendingDeactivate] = useState<CaseRow | null>(null);

  const load = useCallback(async () => {
    setExtract(await loadStudyExtract({ from: bounds.from, to: bounds.to, filters }));
  }, [bounds.from, bounds.to, filters]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(load);

  const health = useMemo(() => trackingHealth(extract.sessions), [extract.sessions]);
  const byCase = extract.metrics.by_case;

  const rows: CaseRow[] = useMemo(() => {
    return cases.map((c) => {
      const stats = byCase.find((b) => b.case_key === c.case_key);
      const h = health.find((x) => x.case_key === c.case_key);
      return {
        ...c,
        starts: stats?.starts ?? 0,
        completions: stats?.completions ?? 0,
        completion_rate: stats?.completion_rate ?? 0,
        health: h?.status ?? "silent",
        checkpointRate: h?.checkpointRate ?? 0,
      };
    });
  }, [byCase, cases, health]);

  useEffect(() => {
    setSelected((prev) => (prev ? (rows.find((r) => r.id === prev.id) ?? prev) : prev));
  }, [rows]);

  const columns: Column<CaseRow>[] = [
    { key: "key", header: "Key", sortValue: (r) => r.case_key, render: (r) => <span className="font-mono text-xs">{r.case_key}</span> },
    {
      key: "name",
      header: "Display name",
      sortValue: (r) => r.display_name,
      render: (r) => <CaseLink caseKey={r.case_key}>{r.display_name}</CaseLink>,
    },
    { key: "status", header: "Status", sortValue: (r) => (r.active ? "active" : "inactive"), render: (r) => (r.active ? "Active" : "Inactive") },
    { key: "version", header: "Version", sortValue: (r) => r.app_version ?? "", render: (r) => r.app_version ?? "—" },
    { key: "starts", header: "Starts in period", sortValue: (r) => r.starts, render: (r) => String(r.starts) },
    { key: "rate", header: "Completion rate", sortValue: (r) => r.completion_rate, render: (r) => formatPercent(r.completion_rate) },
    {
      key: "health",
      header: "Tracking",
      sortValue: (r) => r.health,
      render: (r) => (
        <span className={r.health === "ok" ? "text-ok" : r.health === "sparse" ? "text-copper" : "text-ink-soft"}>
          {r.health === "ok" ? "Healthy" : r.health === "sparse" ? "Sparse checkpoints/geo" : "No sessions"}
        </span>
      ),
    },
  ];

  const snippet = useMemo(() => {
    if (!selected) return "";
    return `window.SIMBOX_TRACKING_CONFIG = {
  caseKey: "${selected.case_key}",
  endpointUrl: "${trackingEndpoint()}",
  appVersion: "${selected.app_version || "1.0.0"}",
  debug: false
};`;
  }, [selected]);

  async function createCase() {
    setError(null);
    const { error: err } = await supabase.from("cases").insert({
      case_key: draftKey.trim(),
      display_name: draftName.trim(),
      app_version: draftVersion.trim() || null,
      active: true,
    });
    if (err) {
      setError("Unable to create the case. Keys must be unique and use letters, numbers, underscore, or hyphen.");
      return;
    }
    logAudit(user?.email ?? "", "create_case", draftKey.trim());
    setCreating(false);
    setDraftKey("");
    setDraftName("");
  }

  async function saveCase(caseId: string, patch: Partial<CaseRecord>) {
    const { error: err } = await supabase.from("cases").update(patch).eq("id", caseId);
    if (err) {
      setError("Unable to save case changes. Case keys cannot change after events exist.");
      return;
    }
    if (patch.active === false) logAudit(user?.email ?? "", "deactivate_case", caseId);
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Catalog</p>
          <h1 className="font-serif mt-1 text-3xl text-ink">Cases</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Starts and tracking health for {formatRange(bounds.from, bounds.to)}. Open a name for the dossier, or
            select a row to copy the GitHub snippet.
          </p>
        </div>
        <button type="button" className="bg-teal px-3 py-2 text-sm text-card" onClick={() => setCreating(true)}>
          New case
        </button>
      </header>
      <FilterBar cases={cases} filters={filters} onChange={setFilters} compact hideCases />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <TruncationNotice truncated={extract.truncated} fetched={extract.fetched} total={extract.total} />
      {creating ? (
        <form
          className="mb-6 grid gap-3 border border-line bg-card p-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createCase();
          }}
        >
          <label className="text-sm">
            Case key
            <input required value={draftKey} onChange={(e) => setDraftKey(e.target.value)} className="mt-1 w-full border border-line bg-paper px-2 py-1.5 font-mono" />
          </label>
          <label className="text-sm">
            Display name
            <input required value={draftName} onChange={(e) => setDraftName(e.target.value)} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Version
            <input value={draftVersion} onChange={(e) => setDraftVersion(e.target.value)} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
          </label>
          <div className="md:col-span-3 flex gap-2">
            <button type="submit" className="bg-ink px-3 py-2 text-sm text-card">
              Create
            </button>
            <button type="button" className="border border-line px-3 py-2 text-sm" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => setSelected(r)}
        emptyTitle="No cases yet"
        emptyBody="Create a case that matches the GitHub repository name, then add tracking to that repository."
      />

      {selected ? (
        <section className="mt-6 border border-line bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl">Configure {selected.display_name}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                <CaseLink caseKey={selected.case_key}>Open the study dossier</CaseLink>
                {" · "}
                {selected.starts} start{selected.starts === 1 ? "" : "s"} in this period · tracking {selected.health}
              </p>
            </div>
            <button
              type="button"
              className="border border-line px-3 py-1.5 text-sm"
              onClick={() => navigate(`/cases/${encodeURIComponent(selected.case_key)}`)}
            >
              Open dossier
            </button>
          </div>
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = (form.elements.namedItem("display_name") as HTMLInputElement).value;
              const version = (form.elements.namedItem("app_version") as HTMLInputElement).value;
              const active = (form.elements.namedItem("active") as HTMLInputElement).checked;
              if (selected.active && !active) {
                setPendingDeactivate(selected);
                return;
              }
              void saveCase(selected.id, { display_name: name, app_version: version || null, active });
            }}
          >
            <label className="text-sm md:col-span-2">
              Case key (immutable after events exist)
              <input readOnly value={selected.case_key} className="mt-1 w-full border border-line bg-paper-2 px-2 py-1.5 font-mono text-ink-soft" />
            </label>
            <label className="text-sm">
              Display name
              <input name="display_name" defaultValue={selected.display_name} key={`${selected.id}-name`} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
            <label className="text-sm">
              Version
              <input name="app_version" defaultValue={selected.app_version ?? ""} key={`${selected.id}-ver`} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="active" type="checkbox" defaultChecked={selected.active} key={`${selected.id}-act`} />
              Active (inactive cases reject new events)
            </label>
            <div>
              <button type="submit" className="bg-ink px-3 py-2 text-sm text-card">
                Save
              </button>
            </div>
          </form>
          <h3 className="mt-6 text-sm font-medium">GitHub repository configuration</h3>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            Also include <code className="font-mono">simbox-case-hooks.js</code> so slide checkpoints fire automatically.
            Optional site code: append <code className="font-mono">?simbox_site=HOSP01</code> to the case URL.
          </p>
          <pre className="mt-2 overflow-x-auto bg-ink p-3 text-xs text-card">
            <code>{snippet}</code>
          </pre>
        </section>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">Select a case to edit its name, version, and tracking snippet.</p>
      )}

      {pendingDeactivate ? (
        <ConfirmDialog
          title="Deactivate this case?"
          body="New events for this case key will be rejected until you activate it again. Existing analytics remain."
          confirmLabel="Deactivate"
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => {
            const target = pendingDeactivate;
            setPendingDeactivate(null);
            void saveCase(target.id, { active: false });
          }}
        />
      ) : null}
    </div>
  );
}
