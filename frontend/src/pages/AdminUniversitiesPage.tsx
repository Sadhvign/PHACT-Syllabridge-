import { ArrowLeft, Building2, Plus, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SUBMISSION_BADGES } from "../lib/analysis";
import { courseLabel, formatDate } from "../lib/format";
import type { Analytics, Submission, University } from "../lib/types";

type InstitutionOption = { id: string; label: string };

type CreateResult = {
  university: University;
  demo_login: { email: string; password: string; note: string };
};

export default function AdminUniversitiesPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [options, setOptions] = useState<InstitutionOption[]>([]);
  const [demoPassword, setDemoPassword] = useState("Demo1234!");

  function reload() {
    api<Analytics>("/api/admin/analytics")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    reload();
    api<{ institution_types: InstitutionOption[]; demo_password: string }>(
      "/api/admin/university-options",
    )
      .then((r) => {
        setOptions(r.institution_types);
        setDemoPassword(r.demo_password);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="page">
      <header className="page-header with-actions">
        <div>
          <h1>Universities</h1>
          <p className="muted">
            Add member schools and review the reports their faculty submitted.
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setShowForm((v) => !v)}>
          <Plus aria-hidden="true" />
          {showForm ? "Close form" : "Add university"}
        </button>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {showForm && (
        <AddUniversityForm
          options={options}
          demoPassword={demoPassword}
          onCreated={() => reload()}
        />
      )}
      <section className="university-grid">
        {data?.universities.map((u) => (
          <Link key={u.id} to={`/admin/universities/${u.id}`} className="university-card">
            <Building2 aria-hidden="true" />
            <strong>{u.name}</strong>
            <small>
              {u.domain}
              {u.region ? ` · ${u.region}` : ""}
            </small>
            {!!u.institution_type_labels?.length && (
              <small className="cell-sub">{u.institution_type_labels.join(" · ")}</small>
            )}
            <span className="university-counts">
              {u.PENDING > 0 && <span className="badge warning">{u.PENDING} pending</span>}
              <span className="badge success">{u.ACCEPTED} accepted</span>
              {u.DECLINED > 0 && <span className="badge danger">{u.DECLINED} declined</span>}
              {u.guardrails_enabled !== false && (
                <span className="badge neutral" title="PII / AI policy guardrails on">
                  Guardrails on
                </span>
              )}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function AddUniversityForm({
  options,
  demoPassword,
  onCreated,
}: {
  options: InstitutionOption[];
  demoPassword: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [guardrails, setGuardrails] = useState(true);
  const [policy, setPolicy] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateResult | null>(null);

  function toggleType(id: string) {
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const body = new FormData();
      body.set("name", name.trim());
      body.set("prefix", prefix.trim());
      body.set("city", city.trim());
      body.set("state", state.trim());
      body.set("zip_code", zip.trim());
      body.set("institution_types", types.join(","));
      body.set("guardrails_enabled", String(guardrails));
      if (policy) body.set("ai_policy", policy);
      const result = await api<CreateResult>("/api/admin/universities", {
        method: "POST",
        body,
      });
      setCreated(result);
      onCreated();
      setName("");
      setPrefix("");
      setCity("");
      setState("");
      setZip("");
      setTypes([]);
      setPolicy(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const domainPreview = prefix.trim()
    ? `${prefix.trim().toLowerCase().replace(/\.edu$/i, "")}.edu`
    : "prefix.edu";

  return (
    <section className="panel">
      <h2 className="panel-title">Add university</h2>
      <p className="muted small">
        Creates the school for the login dropdown and provisions{" "}
        <code>abc@{domainPreview}</code> with password <code>{demoPassword}</code>.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <div className="field-row even">
          <label>
            University name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
          </label>
          <label>
            Email prefix
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              required
              maxLength={40}
              placeholder="gwu"
            />
            <span className="hint">Faculty sign in as abc@{domainPreview}</span>
          </label>
        </div>
        <div className="field-row">
          <label>
            City
            <input value={city} onChange={(e) => setCity(e.target.value)} required maxLength={80} />
          </label>
          <label>
            State
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              maxLength={40}
              placeholder="DC"
            />
          </label>
          <label>
            ZIP
            <input value={zip} onChange={(e) => setZip(e.target.value)} maxLength={20} />
          </label>
        </div>

        <fieldset className="course-context">
          <legend>Institution type</legend>
          <div className="type-grid">
            {options.map((o) => (
              <label key={o.id} className={`focus-option${types.includes(o.id) ? " selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={types.includes(o.id)}
                  onChange={() => toggleType(o.id)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="course-context">
          <legend>AI policy &amp; guardrails</legend>
          <label>
            University AI policy <span className="optional">(optional PDF)</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => setPolicy(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="inline-check">
            <input
              type="radio"
              name="guardrails"
              checked={guardrails}
              onChange={() => setGuardrails(true)}
            />
            <ShieldCheck aria-hidden="true" />
            PII / AI policy guardrails on
          </label>
          <label className="inline-check">
            <input
              type="radio"
              name="guardrails"
              checked={!guardrails}
              onChange={() => setGuardrails(false)}
            />
            Guardrails off for this university
          </label>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {created && (
          <div className="notice">
            Added {created.university.name}. Demo login:{" "}
            <strong>{created.demo_login.email}</strong> /{" "}
            <strong>{created.demo_login.password}</strong>
            <div className="hint">{created.demo_login.note}</div>
          </div>
        )}
        <div className="actions">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Creating…" : "Create university"}
          </button>
        </div>
      </form>
    </section>
  );
}

function UniversitySubmissions({ universityId }: { universityId: string }) {
  const [data, setData] = useState<{ university: University; submissions: Submission[] } | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ university: University; submissions: Submission[] }>(
      `/api/admin/universities/${universityId}/submissions`,
    )
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [universityId]);

  return (
    <>
      <Link to="/admin/universities" className="link back-link">
        <ArrowLeft aria-hidden="true" /> All universities
      </Link>
      <header className="page-header">
        <div>
          <h1>{data?.university.name ?? "University"}</h1>
          <p className="muted">
            {data
              ? `${data.university.domain}${data.university.city ? ` · ${data.university.city}, ${data.university.state}` : data.university.region ? ` · ${data.university.region}` : ""}`
              : " "}
          </p>
          {!!data?.university.institution_type_labels?.length && (
            <ul className="context-chips left">
              {data.university.institution_type_labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
              {data.university.guardrails_enabled !== false && <li>Guardrails on</li>}
            </ul>
          )}
        </div>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <h2 className="panel-title">Submitted reports</h2>
        {data && data.submissions.length === 0 ? (
          <p className="hint">No reports from this university yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Term</th>
                <th>Submitted by</th>
                <th>Submitted</th>
                <th>AI retained</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.submissions.map((s) => (
                <tr key={s.submission_id}>
                  <td>
                    <strong>{courseLabel(s.course_code, s.course_title)}</strong>
                    <small className="cell-sub">Approved version {s.revision}</small>
                  </td>
                  <td className="muted">{s.term_label || s.term || "—"}</td>
                  <td>{s.owner_name}</td>
                  <td className="muted">{formatDate(s.created_at)}</td>
                  <td>{s.stats?.ai_text_retained_percent ?? "–"}%</td>
                  <td>
                    <span className={`badge ${SUBMISSION_BADGES[s.status].tone}`}>
                      {SUBMISSION_BADGES[s.status].label}
                    </span>
                  </td>
                  <td className="row-actions">
                    <Link
                      to={`/admin/submissions/${s.submission_id}`}
                      className="button secondary compact"
                    >
                      {s.status === "PENDING" ? "Review" : "Open"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export function AdminUniversityPage() {
  const { universityId = "" } = useParams();
  return (
    <div className="page">
      <UniversitySubmissions key={universityId} universityId={universityId} />
    </div>
  );
}
