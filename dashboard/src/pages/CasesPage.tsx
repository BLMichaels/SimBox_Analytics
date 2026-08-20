import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaseLink } from "../components/CaseLink";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type Column } from "../components/DataTable";
import { formatPercent } from "../lib/dates";
import { supabase, trackingEndpoint } from "../lib/supabase";
import type { CaseRecord, CaseSummary } from "../lib/types";

export function CasesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CaseSummary[]>([]);
  const [selected, setSelected] = useState<CaseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftVersion, setDraftVersion] = useState("1.0.0");
  const [pendingDeactivate, setPendingDeactivate] = useState<CaseSummary | null>(null);

  async function reload() {
    const { data, error: err } = await supabase
      .from("case_summary_metrics")
      .select("*")
      .order("display_name");
    if (err) {
      setError("Unable to load cases.");
      return;
    }
    setRows((data ?? []) as CaseSummary[]);
  }

  useEffect(() => {
    void reload();
  }, []);

  const columns: Column<CaseSummary>[] = [
    { key: "key", header: "Key", sortValue: (r) => r.case_key, render: (r) => <span className="font-mono text-xs">{r.case_key}</span> },
    {
      key: "name",
      header: "Display name",
      sortValue: (r) => r.display_name,
      render: (r) => <CaseLink caseKey={r.case_key}>{r.display_name}</CaseLink>,
    },
    { key: "status", header: "Status", sortValue: (r) => (r.active ? "active" : "inactive"), render: (r) => (r.active ? "Active" : "Inactive") },
    { key: "version", header: "Version", sortValue: (r) => r.app_version ?? "", render: (r) => r.app_version ?? "—" },
    { key: "starts", header: "Starts", sortValue: (r) => Number(r.total_starts), render: (r) => String(r.total_starts ?? 0) },
    { key: "completions", header: "Completions", sortValue: (r) => Number(r.total_completions), render: (r) => String(r.total_completions ?? 0) },
    { key: "rate", header: "Completion rate", sortValue: (r) => Number(r.completion_rate), render: (r) => formatPercent(Number(r.completion_rate)) },
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
    setCreating(false);
    setDraftKey("");
    setDraftName("");
    await reload();
  }

  async function saveCase(caseId: string, patch: Partial<CaseRecord>) {
    const { error: err } = await supabase.from("cases").update(patch).eq("id", caseId);
    if (err) {
      setError("Unable to save case changes. Case keys cannot change after events exist.");
      return;
    }
    await reload();
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Cases</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Open a case for its study dossier. Register a GitHub Pages case here before events will be accepted.
          </p>
        </div>
        <button type="button" className="bg-teal px-3 py-2 text-sm text-card" onClick={() => setCreating(true)}>
          New case
        </button>
      </header>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
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
        rowKey={(r) => r.case_id}
        onRowClick={(r) => navigate(`/cases/${encodeURIComponent(r.case_key)}`)}
        emptyTitle="No cases yet"
        emptyBody="Create a case that matches the GitHub repository name, then add tracking to that repository."
      />
      <p className="mt-2 text-xs text-ink-soft">Select a row below to edit and copy the GitHub snippet.</p>
      <ul className="mt-3 divide-y divide-line border border-line bg-card">
        {rows.map((r) => (
          <li key={r.case_id}>
            <button
              type="button"
              onClick={() => setSelected(r)}
              className={[
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
                selected?.case_id === r.case_id ? "bg-paper-2" : "hover:bg-paper",
              ].join(" ")}
            >
              <span>{r.display_name}</span>
              <span className="font-mono text-xs text-ink-soft">{r.case_key}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <section className="mt-6 border border-line bg-card p-4">
          <h2 className="font-serif text-xl">Configure {selected.display_name}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            <CaseLink caseKey={selected.case_key}>Open the study dossier</CaseLink> for metrics, funnel, and sessions.
          </p>
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
              void saveCase(selected.case_id, { display_name: name, app_version: version || null, active });
            }}
          >
            <label className="text-sm md:col-span-2">
              Case key (immutable after events exist)
              <input readOnly value={selected.case_key} className="mt-1 w-full border border-line bg-paper-2 px-2 py-1.5 font-mono text-ink-soft" />
            </label>
            <label className="text-sm">
              Display name
              <input name="display_name" defaultValue={selected.display_name} key={`${selected.case_id}-name`} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
            <label className="text-sm">
              Version
              <input name="app_version" defaultValue={selected.app_version ?? ""} key={`${selected.case_id}-ver`} className="mt-1 w-full border border-line bg-paper px-2 py-1.5" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="active" type="checkbox" defaultChecked={selected.active} key={`${selected.case_id}-act`} />
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
            Optional site code: append <code className="font-mono">?simbox_site=HOSP01</code> to the case URL
            (letters, numbers, underscore, hyphen). The player does not know hospital name or user identity.
          </p>
          <pre className="mt-2 overflow-x-auto bg-ink p-3 text-xs text-card">
            <code>{snippet}</code>
          </pre>
        </section>
      ) : null}

      {pendingDeactivate ? (
        <ConfirmDialog
          title="Deactivate this case?"
          body="New events for this case key will be rejected until you activate it again. Existing analytics remain."
          confirmLabel="Deactivate"
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => {
            const target = pendingDeactivate;
            setPendingDeactivate(null);
            void saveCase(target.case_id, { active: false });
          }}
        />
      ) : null}
    </div>
  );
}
