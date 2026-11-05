import { Archive, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { KnowledgeSource, SourceInventory } from "../lib/types";

const SYNC_BADGES: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Waiting to index", tone: "neutral" },
  SYNCING: { label: "Indexing", tone: "info" },
  SYNCED: { label: "Indexed", tone: "success" },
  FAILED: { label: "Index failed", tone: "danger" },
};

const ACCEPTED = ".pdf,.docx,.txt,.md,.html";

type FormState = {
  title: string;
  source_type: string;
  owner: string;
  effective_date: string;
  file: File | null;
};

const EMPTY_FORM: FormState = {
  title: "",
  source_type: "",
  owner: "ASPPH",
  effective_date: "",
  file: null,
};

async function stageFile(file: File): Promise<string> {
  const ticket = await api<{ upload_id: string; upload_url: string; content_type: string }>(
    "/api/admin/sources/uploads",
    { method: "POST", body: JSON.stringify({ file_name: file.name, size_bytes: file.size }) },
  );
  const put = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: { "Content-Type": ticket.content_type },
    body: file,
  });
  if (!put.ok) throw new Error("The document upload was interrupted. Please try again.");
  return ticket.upload_id;
}

export default function AdminSourcesPage() {
  const [inventory, setInventory] = useState<SourceInventory | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<KnowledgeSource | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState("");
  const load = useCallback(async (refresh = false) => {
    try {
      setInventory(
        refresh
          ? await api<SourceInventory>("/api/admin/sources/sync", { method: "POST" })
          : await api<SourceInventory>("/api/admin/sources"),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api<SourceInventory>("/api/admin/sources")
      .then(setInventory)
      .catch((e: Error) => setError(e.message));
  }, []);

  const indexing =
    !!inventory &&
    (!!inventory.sync.active_job_id ||
      inventory.sources.some((s) => s.sync_status === "PENDING" || s.sync_status === "SYNCING"));

  useEffect(() => {
    if (!indexing) return;
    const timer = window.setTimeout(() => void load(true), 15000);
    return () => window.clearTimeout(timer);
  }, [indexing, inventory, load]);

  function openForm(source: KnowledgeSource | "new") {
    setEditing(source);
    setError("");
    setForm(
      source === "new"
        ? EMPTY_FORM
        : {
            title: source.title,
            source_type: source.source_type,
            owner: source.owner,
            effective_date: source.effective_date,
            file: null,
          },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (editing === "new" && !form.file) {
      setError("Attach the source document.");
      return;
    }
    setBusy("form");
    setError("");
    try {
      const upload_id = form.file ? await stageFile(form.file) : null;
      const body = {
        title: form.title,
        source_type: form.source_type,
        owner: form.owner,
        effective_date: form.effective_date,
        upload_id,
        file_name: form.file?.name ?? null,
        expected_version: editing === "new" ? null : editing.version,
      };
      const data =
        editing === "new"
          ? await api<SourceInventory>("/api/admin/sources", {
              method: "POST",
              body: JSON.stringify(body),
            })
          : await api<SourceInventory>(`/api/admin/sources/${editing.source_id}`, {
              method: "PUT",
              body: JSON.stringify(body),
            });
      setInventory(data);
      setEditing(null);
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function retire(source: KnowledgeSource) {
    if (
      !window.confirm(
        `Retire "${source.title}"? It will stop grounding new recommendations once the index updates.`,
      )
    )
      return;
    setBusy(source.source_id);
    setError("");
    try {
      setInventory(
        await api<SourceInventory>(
          `/api/admin/sources/${source.source_id}?expected_version=${source.version}`,
          { method: "DELETE" },
        ),
      );
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const sync = inventory?.sync;
  const active = inventory?.sources.filter((s) => s.governance_status === "ACTIVE") ?? [];
  const retired = inventory?.sources.filter((s) => s.governance_status === "RETIRED") ?? [];

  return (
    <div className="page">
      <header className="page-header with-actions">
        <div>
          <h1>Knowledge sources</h1>
          <p className="muted">Approved ASPPH content that grounds every PHACT recommendation.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button secondary compact"
            onClick={() => void load(true)}
            disabled={!!busy}
          >
            <RefreshCw aria-hidden="true" />
            Check index status
          </button>
          <button type="button" className="button primary compact" onClick={() => openForm("new")}>
            <Plus aria-hidden="true" />
            Add source
          </button>
        </div>
      </header>

      {sync && (
        <section className="panel sync-panel">
          <span className={`badge ${sync.active_job_id ? "info" : sync.last_job_status === "FAILED" ? "danger" : "success"}`}>
            {sync.active_job_id ? "Index update running" : "Index up to date"}
          </span>
          <span className="muted small">
            {sync.last_finished_at
              ? `Last update ${sync.last_job_status.toLowerCase()} on ${formatDate(sync.last_finished_at)}`
              : "No index update has finished yet"}
          </span>
          {sync.last_start_error && (
            <span className="form-error small">
              The last index update couldn't start. It will be retried automatically.
            </span>
          )}
        </section>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {editing && (
        <form className="panel form-stack" onSubmit={submit}>
          <div className="decision-head">
            <h2 className="panel-title">
              {editing === "new" ? "Add a source" : `Update “${editing.title}”`}
            </h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setEditing(null)}>
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="field-row">
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                minLength={3}
                maxLength={200}
                required
              />
            </label>
            <label>
              Effective date
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
              />
            </label>
          </div>
          <div className="field-row even">
            <label>
              Type
              <input
                value={form.source_type}
                onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                placeholder="e.g. Competency framework"
                minLength={2}
                required
              />
            </label>
            <label>
              Owner
              <input
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                minLength={2}
                required
              />
            </label>
          </div>
          <label>
            <span>
              Document{" "}
              {editing !== "new" && <span className="optional">(leave empty to keep {editing.file_name})</span>}
            </span>
            <input
              type="file"
              accept={ACCEPTED}
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
            />
          </label>
          <p className="hint">
            Only add public ASPPH or partner content. Never upload syllabi, student work, or other
            private data here.
          </p>
          <div className="actions">
            <button type="submit" className="button primary" disabled={busy === "form"}>
              {busy === "form" ? "Saving…" : editing === "new" ? "Add and index" : "Save and re-index"}
            </button>
          </div>
        </form>
      )}

      {inventory && (
        <section className="panel">
          <h2 className="panel-title">Active sources ({active.length})</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Owner</th>
                  <th>Effective</th>
                  <th>Version</th>
                  <th>Index</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.map((source) => {
                  const badge = SYNC_BADGES[source.sync_status] ?? { label: source.sync_status, tone: "neutral" };
                  return (
                    <tr key={source.source_id}>
                      <td>
                        <strong>{source.title}</strong>
                        <small className="cell-sub">{source.file_name}</small>
                      </td>
                      <td className="muted">{source.source_type}</td>
                      <td className="muted">{source.owner}</td>
                      <td className="muted">{source.effective_date || "—"}</td>
                      <td className="muted">v{source.version}</td>
                      <td>
                        <span className={`badge ${badge.tone}`} title={source.sync_message || undefined}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-button neutral"
                          aria-label={`Update ${source.title}`}
                          onClick={() => openForm(source)}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Retire ${source.title}`}
                          onClick={() => retire(source)}
                          disabled={busy === source.source_id}
                        >
                          <Archive aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {retired.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">Retired sources ({retired.length})</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Retired</th>
                <th>Removed from index</th>
              </tr>
            </thead>
            <tbody>
              {retired.map((source) => (
                <tr key={source.source_id}>
                  <td>{source.title}</td>
                  <td className="muted">{formatDate(source.updated_at)}</td>
                  <td>
                    {source.removal_verified ? (
                      <span className="badge success">Removed</span>
                    ) : (
                      <span className="badge info">Removing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
