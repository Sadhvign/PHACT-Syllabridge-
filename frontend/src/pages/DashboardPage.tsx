import {
  Activity,
  Archive,
  ArrowRight,
  FileText,
  FolderOpen,
  Library,
  Network,
  Share2,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CountUp, MotionItem, PageMotion } from "../components/motion";
import PageHeader from "../components/PageHeader";
import { SUBMISSION_BADGES } from "../lib/analysis";
import { api } from "../lib/api";
import { courseLabel, formatDate } from "../lib/format";
import type { DashboardData, Share, Submission } from "../lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const QUICK_LINKS = [
  { to: "/upload", label: "My Syllabi", detail: "Manage uploads", icon: FolderOpen },
  { to: "/recommendations", label: "AI Tools", detail: "Explore AI features", icon: Sparkles },
  { to: "/resources", label: "Resources", detail: "Guides & docs", icon: Library },
  { to: "/community", label: "Community", detail: "Connect with peers", icon: Users },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [shared, setShared] = useState<Share[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e: Error) => setError(e.message));
    api<Submission[]>("/api/submissions")
      .then(setSubmissions)
      .catch(() => setSubmissions([]));
    api<Share[]>("/api/shares")
      .then(setShared)
      .catch(() => setShared([]));
  }, []);

  const first = (profile?.given_name || profile?.display_name || "").split(/\s+/)[0] || "there";

  return (
    <PageMotion className="page product-page">
      <PageHeader
        eyebrow="Faculty workspace"
        title={`Welcome back, ${first}`}
        description={profile?.institution}
      />

      <MotionItem>
        <section className="product-hero-card">
          <div className="product-hero-copy">
            <Badge variant="teal">Live syllabus intelligence</Badge>
            <h2>Transform your syllabus with responsible AI</h2>
            <p>
              Upload a syllabus to receive cited recommendations and CEPH competency maps — always
              with privacy guardrails and your approval before anything is shared.
            </p>
            <Button asChild variant="orange" size="lg">
              <Link to="/upload">
                Get started
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="product-hero-orb" aria-hidden="true">
            <Wand2 />
            <span className="product-orb-ring" />
            <span className="product-orb-ring delay" />
          </div>
        </section>
      </MotionItem>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <MotionItem>
        <section className="product-stat-grid" aria-label="Your activity">
          {[
            {
              icon: FileText,
              label: "Syllabi uploaded",
              value: data?.stats.syllabi_uploaded,
              detail: data ? `+${data.stats.syllabi_this_month} this month` : " ",
            },
            {
              icon: Network,
              label: "Competencies mapped",
              value: data?.stats.competencies_mapped,
              detail: data
                ? `across ${data.stats.analyses_completed} analys${data.stats.analyses_completed === 1 ? "is" : "es"}`
                : " ",
            },
            {
              icon: Activity,
              label: "Recent activity",
              value: data?.stats.actions_this_week,
              detail: data ? "actions this week" : " ",
            },
          ].map(({ icon: Icon, label, value, detail }) => (
            <Card key={label} className="product-stat-card">
              <CardContent className="flex items-start gap-4 p-5">
                <span className="product-stat-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <p className="stat-label">{label}</p>
                  <p className="stat-value">
                    {value === undefined ? <Skeleton className="h-8 w-12" /> : <CountUp value={value} />}
                  </p>
                  <p className="stat-detail">{detail}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </MotionItem>

      <MotionItem>
        <section className="product-two-col">
          <Card className="product-panel">
            <CardHeader>
              <CardTitle>Recent uploads</CardTitle>
              <CardDescription>Jump back into a syllabus review.</CardDescription>
            </CardHeader>
            <CardContent>
              {data && data.recent_uploads.length === 0 ? (
                <div className="empty">
                  <p>No syllabi uploaded yet.</p>
                  <Link to="/upload" className="link">
                    Upload your first syllabus
                  </Link>
                </div>
              ) : (
                <ul className="product-list">
                  {data?.recent_uploads.map((item) => (
                    <li key={item.syllabus_id}>
                      <FileText aria-hidden="true" />
                      <span className="list-text">
                        <strong>{item.title}</strong>
                        <small>Uploaded {formatDate(item.uploaded_at)}</small>
                      </span>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/upload?syllabus=${item.syllabus_id}`}>View</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="product-panel">
            <CardHeader>
              <CardTitle>Saved recommendations</CardTitle>
              <CardDescription>Approved and draft analyses ready for review.</CardDescription>
            </CardHeader>
            <CardContent>
              {data && data.saved_recommendations.length === 0 ? (
                <div className="empty">
                  <p>Completed analyses will appear here.</p>
                </div>
              ) : (
                <ul className="product-list">
                  {data?.saved_recommendations.map((item) => (
                    <li key={item.analysis_id}>
                      <Sparkles aria-hidden="true" />
                      <span className="list-text">
                        <strong>{item.title}</strong>
                        <small>
                          {STATUS_LABELS[item.review_status] ?? item.review_status} · Saved{" "}
                          {formatDate(item.saved_at)}
                        </small>
                      </span>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/review?analysis=${item.analysis_id}`}>Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </MotionItem>

      <MotionItem>
        <section className="product-two-col">
          <Card className="product-panel">
            <CardHeader>
              <CardTitle>ASPPH repository submissions</CardTitle>
            </CardHeader>
            <CardContent>
              {submissions && submissions.length === 0 ? (
                <div className="empty">
                  <p>Reports you submit to the ASPPH repository will show their status here.</p>
                </div>
              ) : (
                <ul className="product-list">
                  {submissions?.map((s) => (
                    <li key={s.submission_id}>
                      <Archive aria-hidden="true" />
                      <span className="list-text">
                        <strong>{courseLabel(s.course_code, s.course_title)}</strong>
                        <small>
                          Version {s.revision} · submitted {formatDate(s.created_at)}
                          {s.admin_note ? ` · ASPPH: ${s.admin_note}` : ""}
                        </small>
                      </span>
                      <span className={`badge ${SUBMISSION_BADGES[s.status].tone}`}>
                        {SUBMISSION_BADGES[s.status].label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="product-panel">
            <CardHeader>
              <CardTitle>Shared with you</CardTitle>
            </CardHeader>
            <CardContent>
              {shared && shared.length === 0 ? (
                <div className="empty">
                  <p>Reports colleagues share with you will appear here.</p>
                </div>
              ) : (
                <ul className="product-list">
                  {shared?.map((s) => (
                    <li key={s.share_id}>
                      <Share2 aria-hidden="true" />
                      <span className="list-text">
                        <strong>{courseLabel(s.course_code, s.course_title)}</strong>
                        <small>
                          From {s.owner_name}, {s.university_name} · {formatDate(s.created_at)}
                        </small>
                      </span>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/shared/${s.share_id}`}>Open</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </MotionItem>

      <MotionItem>
        <section className="product-quick-grid" aria-label="Quick links">
          {QUICK_LINKS.map(({ to, label, detail, icon: Icon }) => (
            <Link key={label} to={to} className="product-quick-card">
              <Icon aria-hidden="true" />
              <strong>{label}</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </section>
      </MotionItem>
    </PageMotion>
  );
}
