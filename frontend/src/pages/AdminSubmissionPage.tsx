import { ArrowLeft, Check, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ImpactSummary from "../components/ImpactSummary";
import { api } from "../lib/api";
import { SUBMISSION_BADGES } from "../lib/analysis";
import { courseLabel, formatDate } from "../lib/format";
import type { Submission } from "../lib/types";

function SubmissionReview({ submissionId }: { submissionId: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Submission>(`/api/admin/submissions/${submissionId}`)
      .then(setSubmission)
      .catch((e: Error) => setError(e.message));
  }, [submissionId]);

  async function decide(decision: "ACCEPTED" | "DECLINED") {
    setBusy(decision);
    setError("");
    try {
      setSubmission(
        await api<Submission>(`/api/admin/submissions/${submissionId}/decision`, {
          method: "POST",
          body: JSON.stringify({ decision, note }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!submission) {
    return error ? <p className="form-error" role="alert">{error}</p> : <p className="muted">Loading submission…</p>;
  }
  const badge = SUBMISSION_BADGES[submission.status];

  return (
    <>
      <Link to={`/admin/universities/${submission.university_id}`} className="link back-link">
        <ArrowLeft aria-hidden="true" /> {submission.university_name}
      </Link>
      <header className="page-header">
        <div>
          <h1>{courseLabel(submission.course_code, submission.course_title)}</h1>
          <p className="muted">
            Submitted by {submission.owner_name}, {submission.university_name} on{" "}
            {formatDate(submission.created_at)} · faculty-approved version {submission.revision}
          </p>
        </div>
        <span className={`badge ${badge.tone}`}>{badge.label}</span>
      </header>

      {submission.faculty_note && (
        <blockquote className="share-message">
          <strong>Note from {submission.owner_name}:</strong> {submission.faculty_note}
        </blockquote>
      )}

      <ImpactSummary stats={submission.stats} changes={submission.changes} />

      <section className="panel decision-panel">
        <h2 className="panel-title">Repository decision</h2>
        {submission.status === "PENDING" ? (
          <>
            <label>
              Note (stored with the report in the repository)
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </label>
            <div className="button-row">
              <button type="button" className="button primary" disabled={!!busy} onClick={() => decide("ACCEPTED")}>
                <Check aria-hidden="true" />
                {busy === "ACCEPTED" ? "Accepting…" : "Accept into repository"}
              </button>
              <button type="button" className="button danger" disabled={!!busy} onClick={() => decide("DECLINED")}>
                <X aria-hidden="true" />
                {busy === "DECLINED" ? "Declining…" : "Decline"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="body-copy">
              {submission.status === "ACCEPTED" ? "Accepted" : "Declined"} by {submission.decided_by} on{" "}
              {formatDate(submission.decided_at ?? "")}.
              {submission.admin_note && <> Note: {submission.admin_note}</>}
            </p>
            {submission.repository_url && (
              <a className="button secondary" href={submission.repository_url}>
                <Download aria-hidden="true" /> Download repository copy
              </a>
            )}
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      {submission.pdf_url && (
        <section className="panel">
          <div className="panel-heading">
            <h2 className="panel-title">Submitted report</h2>
            {submission.download_url && (
              <a className="button secondary compact" href={submission.download_url}>
                <Download aria-hidden="true" /> Download
              </a>
            )}
          </div>
          <iframe className="pdf-frame" src={submission.pdf_url} title="Submitted report" />
        </section>
      )}
    </>
  );
}

export default function AdminSubmissionPage() {
  const { submissionId = "" } = useParams();
  return (
    <div className="page">
      <SubmissionReview key={submissionId} submissionId={submissionId} />
    </div>
  );
}
