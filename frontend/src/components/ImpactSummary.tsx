import type { ItemChange, ProvenanceStats } from "../lib/types";

const KIND_LABELS = { recommendations: "Recommendation", objectives: "Objective mapping" };

export default function ImpactSummary({
  stats,
  changes,
}: {
  stats: ProvenanceStats;
  changes: ItemChange[];
}) {
  const rows = [
    { label: "Recommendations", counts: stats.recommendations },
    { label: "Objective mappings", counts: stats.objectives },
  ];
  return (
    <section className="panel">
      <h2 className="panel-title">How much AI shaped this report</h2>
      <div className="stat-grid four">
        <article className="stat-card plain">
          <div>
            <p className="stat-label">AI text retained</p>
            <p className="stat-value">{stats.ai_text_retained_percent}%</p>
            <p className="stat-detail">of approved wording is unchanged AI text</p>
          </div>
        </article>
        <article className="stat-card plain">
          <div>
            <p className="stat-label">Changed by faculty</p>
            <p className="stat-value">{stats.faculty_changed_percent}%</p>
            <p className="stat-detail">of AI items edited or excluded</p>
          </div>
        </article>
        {rows.map(({ label, counts }) => (
          <article key={label} className="stat-card plain">
            <div>
              <p className="stat-label">{label}</p>
              <p className="stat-value">
                {counts.kept}
                <small> kept</small>
              </p>
              <p className="stat-detail">
                {counts.edited} edited · {counts.excluded} excluded of {counts.total}
              </p>
            </div>
          </article>
        ))}
      </div>
      <div className="legend">
        <span className="legend-swatch ai" /> AI-generated, kept
        <span className="legend-swatch faculty" /> Edited by faculty
        <span className="legend-swatch admin" /> ASPPH admin review
      </div>
      {changes.length > 0 ? (
        <ul className="change-list">
          {changes.map((c) => (
            <li key={`${c.kind}:${c.id}`}>
              <span className={`badge ${c.status === "EDITED" ? "warning" : "danger"}`}>
                {c.status === "EDITED" ? "Edited" : "Excluded"}
              </span>
              <span>
                <strong>{c.title}</strong>
                <small className="cell-sub">
                  {KIND_LABELS[c.kind]}
                  {c.fields.length > 0 && ` · changed ${c.fields.map((f) => f.replace(/_/g, " ")).join(", ")}`}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Faculty approved every AI item as generated.</p>
      )}
    </section>
  );
}
