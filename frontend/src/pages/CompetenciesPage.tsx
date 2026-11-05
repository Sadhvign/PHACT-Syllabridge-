import { ArrowRight, Briefcase, Target } from "lucide-react";
import { Link } from "react-router-dom";
import Citations from "../components/Citations";
import JobProgress from "../components/JobProgress";
import WorkflowPage from "../components/WorkflowPage";
import { COVERAGE_BADGES } from "../lib/analysis";
import type { Coverage } from "../lib/types";

export default function CompetenciesPage() {
  return (
    <WorkflowPage
      title="Competency mapping insights"
      description="How your learning objectives align with CEPH competencies and workforce needs."
    >
      {({ analysis, revision, reload }) => {
        const part = revision?.content.competencies;
        if (!part) return <JobProgress analysis={analysis} onChanged={() => void reload()} />;
        const included = part.objectives.filter((o) => !o.excluded);
        const counts: Record<Coverage, number> = { STRONG: 0, PARTIAL: 0, GAP: 0 };
        included.forEach((o) => (counts[o.coverage] += 1));
        const mapped = counts.STRONG + counts.PARTIAL;
        const pct = included.length ? Math.round((mapped / included.length) * 100) : 0;

        return (
          <>
            <JobProgress analysis={analysis} onChanged={() => void reload()} compact />
            <section className="stat-grid four" aria-label="Coverage summary">
              <article className="stat-card">
                <Target aria-hidden="true" />
                <div>
                  <p className="stat-label">Objectives mapped</p>
                  <p className="stat-value">
                    {mapped}/{included.length}
                  </p>
                  <p className="stat-detail">{pct}% have a matching competency</p>
                </div>
              </article>
              {(Object.keys(counts) as Coverage[]).map((c) => (
                <article key={c} className={`stat-card coverage-${c.toLowerCase()}`}>
                  <div>
                    <p className="stat-label">{COVERAGE_BADGES[c].label} coverage</p>
                    <p className="stat-value">{counts[c]}</p>
                    <p className="stat-detail">objective{counts[c] === 1 ? "" : "s"}</p>
                  </div>
                </article>
              ))}
            </section>

            <section className="panel">
              <h2 className="panel-title">Objectives → competencies</h2>
              <div className="table-scroll">
                <table className="data-table mapping-table">
                  <thead>
                    <tr>
                      <th>Learning objective</th>
                      <th>Matched competencies</th>
                      <th>Coverage</th>
                      <th>Gaps and notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.objectives.map((o) => {
                      const badge = COVERAGE_BADGES[o.coverage];
                      return (
                        <tr key={o.id} className={o.excluded ? "excluded" : undefined}>
                          <td>
                            <strong>{o.objective}</strong>
                            {o.excluded && <small className="cell-sub">Excluded by reviewer</small>}
                          </td>
                          <td>
                            {o.matches.length ? (
                              <ul className="plain-list tight">
                                {o.matches.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="muted">None found</span>
                            )}
                            <Citations
                              refs={o.citations}
                              evidence={part.evidence}
                              status={o.evidence_status}
                            />
                          </td>
                          <td>
                            <span className={`badge ${badge.tone}`}>{badge.label}</span>
                          </td>
                          <td className="muted">{o.gap_notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="two-column">
              <section className="panel">
                <h2 className="panel-title">
                  <Briefcase aria-hidden="true" className="title-icon" />
                  Workforce expectations
                </h2>
                <ul className="insight-list">
                  {part.workforce_expectations.map((w) => (
                    <li key={w.id}>
                      <strong>{w.expectation}</strong>
                      <p>{w.course_alignment}</p>
                      <Citations refs={w.citations} evidence={part.evidence} status={w.evidence_status} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel">
                <h2 className="panel-title">
                  <Target aria-hidden="true" className="title-icon" />
                  Competencies not yet covered
                </h2>
                <ul className="insight-list">
                  {part.uncovered_competencies.map((u) => (
                    <li key={u.id}>
                      <strong>{u.competency}</strong>
                      <p>{u.suggestion}</p>
                      <Citations refs={u.citations} evidence={part.evidence} status={u.evidence_status} />
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="next-step">
              <Link to={`/review?analysis=${analysis.analysis_id}`} className="button primary">
                Review and approve
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </>
        );
      }}
    </WorkflowPage>
  );
}
