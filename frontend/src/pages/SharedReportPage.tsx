import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ImpactSummary from "../components/ImpactSummary";
import { api } from "../lib/api";
import { courseLabel, formatDate } from "../lib/format";
import type { Share } from "../lib/types";

function SharedReport({ shareId }: { shareId: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Share>(`/api/shares/${shareId}`)
      .then(setShare)
      .catch((e: Error) => setError(e.message));
  }, [shareId]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!share) return <p className="muted">Loading shared report…</p>;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow-dark">
            <Share2 aria-hidden="true" /> Shared with you · View only
          </p>
          <h1>{courseLabel(share.course_code, share.course_title)}</h1>
          <p className="muted">
            Shared by {share.owner_name}, {share.university_name} · approved version{" "}
            {share.revision} · {formatDate(share.created_at)}
          </p>
        </div>
        {share.download_url && (
          <a className="button primary" href={share.download_url}>
            <Download aria-hidden="true" /> Download PDF
          </a>
        )}
      </header>
      {share.message && <blockquote className="share-message">{share.message}</blockquote>}
      <ImpactSummary stats={share.stats} changes={share.changes} />
      {share.pdf_url && (
        <section className="panel">
          <iframe className="pdf-frame" src={share.pdf_url} title="Shared report" />
          <p className="hint">The preview link expires after a few minutes. Reload to view again.</p>
        </section>
      )}
    </>
  );
}

export default function SharedReportPage() {
  const { shareId = "" } = useParams();
  return (
    <div className="page">
      <SharedReport key={shareId} shareId={shareId} />
    </div>
  );
}
