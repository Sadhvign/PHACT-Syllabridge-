import { Download, FileText, FileType2, Lock, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FeedbackCard from "../components/FeedbackCard";
import SharePanel from "../components/SharePanel";
import SyllabusPdfPreview, { draftsToPreviewRecs } from "../components/SyllabusPdfPreview";
import WorkflowPage, { WorkflowContext } from "../components/WorkflowPage";
import { api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import type { ExportItem, Feedback, Revision } from "../lib/types";

const FORMATS = [
  { id: "DOCX" as const, label: "Word document", detail: "Edit and adapt in Word", icon: FileText },
  { id: "PDF" as const, label: "PDF report", detail: "Ready to read and print", icon: FileType2 },
];

function ExportWorkspace({ analysis }: WorkflowContext) {
  const approved = analysis.approved_revision;
  const [approvedRev, setApprovedRev] = useState<Revision | null>(null);
  const [exportsList, setExportsList] = useState<ExportItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null | undefined>(undefined);
  const [previewRecId, setPreviewRecId] = useState("");

  useEffect(() => {
    api<Feedback | null>(`/api/analyses/${analysis.analysis_id}/feedback`)
      .then(setFeedback)
      .catch(() => setFeedback(null));
  }, [analysis.analysis_id]);

  const refresh = useCallback(() => {
    api<ExportItem[]>(`/api/analyses/${analysis.analysis_id}/exports`)
      .then(setExportsList)
      .catch((e: Error) => setError(e.message));
  }, [analysis.analysis_id]);

  useEffect(() => {
    if (!approved) return;
    refresh();
    api<Revision>(`/api/analyses/${analysis.analysis_id}/revisions/${approved}`)
      .then(setApprovedRev)
      .catch((e: Error) => setError(e.message));
  }, [analysis.analysis_id, approved, refresh]);

  const approvedRecs = approvedRev?.content.recommendations?.recommendations ?? [];
  const previewRecs = useMemo(() => draftsToPreviewRecs(approvedRecs), [approvedRecs]);

  useEffect(() => {
    const first = previewRecs.find((r) => !r.excluded);
    if (!previewRecId && first) setPreviewRecId(first.id);
  }, [previewRecId, previewRecs]);

  async function download(item: ExportItem) {
    setBusy(item.export_id);
    setError("");
    try {
      const link = await api<{ url: string }>(
        `/api/analyses/${analysis.analysis_id}/exports/${item.export_id}/link`,
        { method: "POST" },
      );
      window.location.assign(link.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function create(format: "DOCX" | "PDF") {
    setBusy(format);
    setError("");
    try {
      const item = await api<ExportItem>(`/api/analyses/${analysis.analysis_id}/exports`, {
        method: "POST",
        body: JSON.stringify({ revision: approved, format }),
      });
      refresh();
      await download(item);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!approved) {
    return (
      <section className="panel empty">
        <Lock className="empty-icon" aria-hidden="true" />
        <p>
          Nothing can be exported until you approve the results. This keeps unreviewed AI output out
          of your course materials.
        </p>
        <Link to={`/review?analysis=${analysis.analysis_id}`} className="button primary">
          Go to review
        </Link>
      </section>
    );
  }

  const recCount = approvedRecs.filter((r) => !r.excluded).length;
  const objCount =
    approvedRev?.content.competencies?.objectives.filter((o) => !o.excluded).length ?? 0;

  return (
    <>
      <section className="panel approval-summary">
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2 className="panel-title">Approved version {approved}</h2>
          <p className="body-copy">
            {approvedRev
              ? `Approved by ${approvedRev.reviewer_name} on ${formatDate(approvedRev.reviewed_at)}. ` +
                `Includes ${recCount} recommendation${recCount === 1 ? "" : "s"} and ` +
                `${objCount} mapped objective${objCount === 1 ? "" : "s"}, with source citations.`
              : "Loading approval details…"}
          </p>
          {analysis.latest_revision > approved && (
            <p className="hint">
              You have a newer draft (version {analysis.latest_revision}). Exports use the approved
              version until the new draft is approved.
            </p>
          )}
        </div>
      </section>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {approvedRev && (
        <section className="export-preview-section">
          <div className="export-preview-intro">
            <h2 className="panel-title">Preview before you export</h2>
            <p className="muted small">
              See exactly how recommendations land in your syllabus. Click a card in the preview or a
              title below to jump to that update—then download Word or PDF when it looks right.
            </p>
            <div className="export-preview-toc">
              {previewRecs
                .filter((r) => !r.excluded)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`export-toc-item${previewRecId === r.id ? " is-active" : ""}`}
                    onClick={() => setPreviewRecId(r.id)}
                  >
                    {r.title}
                  </button>
                ))}
            </div>
          </div>
          <SyllabusPdfPreview
            analysisId={analysis.analysis_id}
            courseTitle={analysis.course_title}
            courseCode={analysis.course_code}
            recommendations={previewRecs}
            selectedRecId={previewRecId}
            onSelectRec={setPreviewRecId}
            standalone
          />
        </section>
      )}

      <section className="format-grid">
        {FORMATS.map(({ id, label, detail, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="format-card"
            onClick={() => create(id)}
            disabled={!!busy}
          >
            <Icon aria-hidden="true" />
            <strong>{busy === id ? "Preparing…" : label}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </section>

      <section className="panel">
        <h2 className="panel-title">Your exports</h2>
        {exportsList && exportsList.length === 0 ? (
          <div className="empty">
            <p>Exported reports will appear here.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Version</th>
                <th>Size</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {exportsList?.map((item) => (
                <tr key={item.export_id}>
                  <td>
                    <strong>{item.file_name}</strong>
                    <small className="cell-sub">Approved by {item.reviewer_name}</small>
                  </td>
                  <td className="muted">v{item.revision}</td>
                  <td className="muted">{formatBytes(item.size_bytes)}</td>
                  <td className="muted">{formatDate(item.created_at)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => download(item)}
                      disabled={!!busy}
                    >
                      <Download aria-hidden="true" />
                      {busy === item.export_id ? "Preparing…" : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="privacy-line">
          <Lock aria-hidden="true" />
          Exports are private to your account. Each download uses a link that expires after a few
          minutes. Reports highlight AI-generated content in blue and your edits in amber.
        </p>
      </section>

      <div className="share-grid">
        <SharePanel analysisId={analysis.analysis_id} approved={approved} />
        {feedback !== undefined && (
          <FeedbackCard analysisId={analysis.analysis_id} initial={feedback} />
        )}
      </div>
    </>
  );
}

export default function ExportPage() {
  return (
    <WorkflowPage
      title="Export and share"
      description="Download your approved report, share it with colleagues, or submit it to ASPPH."
    >
      {(ctx) => (
        <ExportWorkspace
          key={`${ctx.analysis.analysis_id}:${ctx.analysis.approved_revision}`}
          {...ctx}
        />
      )}
    </WorkflowPage>
  );
}
