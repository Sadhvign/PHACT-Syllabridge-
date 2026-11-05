import { Archive, Check, Copy, Link2, Mail, Send } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { SUBMISSION_BADGES } from "../lib/analysis";
import { formatDate } from "../lib/format";
import type { EmailShareResult, Share, Submission } from "../lib/types";

function shareUrl(shareId: string): string {
  return `${window.location.origin}${window.location.pathname}#/shared/${shareId}`;
}

function LinkShare({ analysisId }: { analysisId: string }) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const share = await api<Share>(`/api/analyses/${analysisId}/shares/link`, { method: "POST" });
      setLink(shareUrl(share.share_id));
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="share-block">
      <h3>
        <Link2 aria-hidden="true" /> Generate shareable link
      </h3>
      <div className="field-row even">
        <label>
          Permissions
          <select value="VIEW" disabled>
            <option value="VIEW">View only</option>
          </select>
        </label>
        <button type="button" className="button secondary" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : link ? "Generate new link" : "Generate link"}
        </button>
      </div>
      {link && (
        <div className="copy-row">
          <input readOnly value={link} aria-label="Shareable link" onFocus={(e) => e.target.select()} />
          <button type="button" className="button secondary compact" onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="hint">Only signed-in PHACT faculty at member universities can open this link.</p>
    </div>
  );
}

function EmailShare({ analysisId }: { analysisId: string }) {
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<EmailShareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const outcome = await api<EmailShareResult>(`/api/analyses/${analysisId}/shares/email`, {
        method: "POST",
        body: JSON.stringify({ emails: emails.split(/[,;\s]+/).filter(Boolean), message }),
      });
      setResult(outcome);
      if (outcome.shared) {
        setEmails("");
        setMessage("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const failed = result?.recipients.filter((r) => r.error) ?? [];

  return (
    <form className="share-block" onSubmit={submit}>
      <h3>
        <Mail aria-hidden="true" /> Email to colleagues
      </h3>
      <label>
        Colleague emails
        <input
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="name@abc.edu, name@riverside.edu"
          required
        />
      </label>
      <label>
        Message (optional)
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          placeholder="Add a note for your colleagues"
        />
      </label>
      <button className="button secondary" disabled={busy || !emails.trim()}>
        <Send aria-hidden="true" />
        {busy ? "Checking…" : "Share by email"}
      </button>
      {result?.shared && (
        <p className="notice" role="status">
          Shared successfully with {result.recipients.map((r) => r.email).join(", ")}. They'll find
          it under "Shared with you" on their PHACT dashboard.
        </p>
      )}
      {failed.length > 0 && (
        <div className="form-error" role="alert">
          Nothing was shared. Fix these addresses and try again:
          <ul>
            {failed.map((r) => (
              <li key={r.email}>
                <strong>{r.email}</strong>: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function RepositorySubmit({ analysisId, approved }: { analysisId: string; approved: number }) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Submission[]>("/api/submissions")
      .then((all) => setSubmissions(all.filter((s) => s.analysis_id === analysisId)))
      .catch((e: Error) => setError(e.message));
  }, [analysisId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<Submission>(`/api/analyses/${analysisId}/submission`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setSubmissions((current) => [created, ...(current ?? [])]);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = submissions?.find(
    (s) => s.revision === approved && (s.status === "PENDING" || s.status === "ACCEPTED"),
  );

  return (
    <form className="share-block" onSubmit={submit}>
      <h3>
        <Archive aria-hidden="true" /> Add to ASPPH repository
      </h3>
      <p className="hint">
        Sends the approved PDF, with AI and faculty edits highlighted, to ASPPH for review. Accepted
        reports join the curriculum repository with a note crediting your university.
      </p>
      {current ? (
        <p className="submission-status">
          <span className={`badge ${SUBMISSION_BADGES[current.status].tone}`}>
            {SUBMISSION_BADGES[current.status].label}
          </span>
          Version {current.revision} submitted {formatDate(current.created_at)}
          {current.admin_note && <em> · ASPPH: {current.admin_note}</em>}
        </p>
      ) : (
        <>
          <label>
            Note to ASPPH (optional)
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </label>
          <button className="button primary" disabled={busy || submissions === null}>
            <Archive aria-hidden="true" />
            {busy ? "Submitting…" : "Submit to repository"}
          </button>
        </>
      )}
      {submissions?.some((s) => s.status === "DECLINED" && s.revision === approved) && !current && (
        <p className="hint">ASPPH declined an earlier submission of this version. You can resubmit.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

export default function SharePanel({ analysisId, approved }: { analysisId: string; approved: number }) {
  return (
    <section className="panel share-panel">
      <h2 className="panel-title">Share with colleagues</h2>
      <p className="body-copy">
        Recipients see approved version {approved}, with AI-generated and faculty-edited content
        highlighted.
      </p>
      <LinkShare analysisId={analysisId} />
      <EmailShare analysisId={analysisId} />
      <RepositorySubmit analysisId={analysisId} approved={approved} />
    </section>
  );
}
