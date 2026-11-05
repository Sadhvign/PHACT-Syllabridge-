import { Archive, CheckCircle2, Clock, Share2, Sparkles, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { SUBMISSION_BADGES } from "../lib/analysis";
import { courseLabel, formatDate } from "../lib/format";
import type { Analytics } from "../lib/types";

function value(n: number | null | undefined, suffix = ""): string {
  return n === null || n === undefined ? "–" : `${n}${suffix}`;
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Analytics>("/api/admin/analytics")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const t = data?.totals;
  const maxSubmissions = Math.max(1, ...(data?.universities.map((u) => u.submissions) ?? [1]));
  const itemTotal = (data?.items.kept ?? 0) + (data?.items.edited ?? 0) + (data?.items.excluded ?? 0);
  const pct = (n = 0) => (itemTotal ? (n / itemTotal) * 100 : 0);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Repository analytics</h1>
          <p className="muted">Curriculum reports submitted by member universities.</p>
        </div>
        <Link to="/admin/universities" className="button primary">
          Review submissions
        </Link>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="stat-grid four" aria-label="Totals">
        <article className="stat-card">
          <Archive aria-hidden="true" />
          <div>
            <p className="stat-label">Reports received</p>
            <p className="stat-value">{value(t?.submissions)}</p>
            <p className="stat-detail">from {value(t?.universities_active)} universities</p>
          </div>
        </article>
        <article className="stat-card">
          <Clock aria-hidden="true" />
          <div>
            <p className="stat-label">Pending review</p>
            <p className="stat-value">{value(t?.pending)}</p>
            <p className="stat-detail">awaiting accept or decline</p>
          </div>
        </article>
        <article className="stat-card">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <p className="stat-label">Approved into repository</p>
            <p className="stat-value">{value(t?.accepted)}</p>
            <p className="stat-detail">
              {value(t?.acceptance_rate, "%")} acceptance · {value(t?.declined)} declined
            </p>
          </div>
        </article>
        <article className="stat-card">
          <Sparkles aria-hidden="true" />
          <div>
            <p className="stat-label">AI text retained</p>
            <p className="stat-value">{value(t?.avg_ai_retained_percent, "%")}</p>
            <p className="stat-detail">average across submitted reports</p>
          </div>
        </article>
        <article className="stat-card">
          <Star aria-hidden="true" />
          <div>
            <p className="stat-label">Faculty experience</p>
            <p className="stat-value">{value(t?.avg_experience)}</p>
            <p className="stat-detail">
              usefulness {value(t?.avg_usefulness)} · {value(t?.feedback)} ratings
            </p>
          </div>
        </article>
        <article className="stat-card">
          <Share2 aria-hidden="true" />
          <div>
            <p className="stat-label">Colleague shares</p>
            <p className="stat-value">{value(t?.shares)}</p>
            <p className="stat-detail">links and inbox shares</p>
          </div>
        </article>
      </section>

      <section className="two-column">
        <article className="panel">
          <h2 className="panel-title">Reports by university</h2>
          <div className="bar-chart">
            {data?.universities.map((u) => (
              <Link key={u.id} to={`/admin/universities/${u.id}`} className="bar-row">
                <span className="bar-label">{u.name}</span>
                <span className="bar-track">
                  <span className="bar accepted" style={{ width: `${(u.ACCEPTED / maxSubmissions) * 100}%` }} />
                  <span className="bar pending" style={{ width: `${(u.PENDING / maxSubmissions) * 100}%` }} />
                  <span className="bar declined" style={{ width: `${(u.DECLINED / maxSubmissions) * 100}%` }} />
                </span>
                <span className="bar-value">{u.submissions}</span>
              </Link>
            ))}
          </div>
          <div className="legend">
            <span className="legend-swatch accepted" /> Accepted
            <span className="legend-swatch pending" /> Pending
            <span className="legend-swatch declined" /> Declined
          </div>
        </article>

        <article className="panel">
          <h2 className="panel-title">What faculty did with AI suggestions</h2>
          <div className="stacked-bar" aria-label="Kept, edited, and excluded AI items">
            <span className="bar accepted" style={{ width: `${pct(data?.items.kept)}%` }} />
            <span className="bar pending" style={{ width: `${pct(data?.items.edited)}%` }} />
            <span className="bar declined" style={{ width: `${pct(data?.items.excluded)}%` }} />
          </div>
          <div className="legend">
            <span className="legend-swatch accepted" /> Kept {data?.items.kept ?? 0}
            <span className="legend-swatch pending" /> Edited {data?.items.edited ?? 0}
            <span className="legend-swatch declined" /> Excluded {data?.items.excluded ?? 0}
          </div>
          <h3 className="subhead">Submissions by month</h3>
          {data && data.by_month.length === 0 ? (
            <p className="hint">No submissions yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Month</th><th>Accepted</th><th>Pending</th><th>Declined</th></tr>
              </thead>
              <tbody>
                {data?.by_month.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td><td>{m.accepted}</td><td>{m.pending}</td><td>{m.declined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>

      <section className="panel">
        <h2 className="panel-title">University metrics</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>University</th>
              <th>Reports</th>
              <th>Accepted</th>
              <th>Pending</th>
              <th>AI retained</th>
              <th>Faculty changed</th>
              <th>Experience</th>
              <th>Usefulness</th>
              <th>Shares</th>
            </tr>
          </thead>
          <tbody>
            {data?.universities.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link to={`/admin/universities/${u.id}`} className="link">{u.name}</Link>
                  <small className="cell-sub">{u.domain} · {u.region}</small>
                </td>
                <td>{u.submissions}</td>
                <td>{u.ACCEPTED}</td>
                <td>{u.PENDING}</td>
                <td>{value(u.avg_ai_retained_percent, "%")}</td>
                <td>{value(u.avg_faculty_changed_percent, "%")}</td>
                <td>{value(u.avg_experience)}</td>
                <td>{value(u.avg_usefulness)}</td>
                <td>{u.shares}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2 className="panel-title">Latest submissions</h2>
        {data && data.recent.length === 0 ? (
          <p className="hint">Submissions from faculty will appear here.</p>
        ) : (
          <ul className="list">
            {data?.recent.map((s) => (
              <li key={s.submission_id}>
                <Archive aria-hidden="true" />
                <span className="list-text">
                  <strong>{courseLabel(s.course_code, s.course_title)}</strong>
                  <small>{s.owner_name} · {s.university_name} · {formatDate(s.created_at)}</small>
                </span>
                <span className={`badge ${SUBMISSION_BADGES[s.status].tone}`}>
                  {SUBMISSION_BADGES[s.status].label}
                </span>
                <Link to={`/admin/submissions/${s.submission_id}`} className="link">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
