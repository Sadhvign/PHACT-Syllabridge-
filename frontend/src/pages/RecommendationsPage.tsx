import { ArrowRight, FileUp, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Citations from "../components/Citations";
import JobProgress from "../components/JobProgress";
import RecDetailTabs from "../components/RecDetailTabs";
import WorkflowPage from "../components/WorkflowPage";
import { api } from "../lib/api";
import { CATEGORY_LABELS, newIdempotencyKey, privacySummary } from "../lib/analysis";
import { courseLabel, formatDate } from "../lib/format";
import type { Analysis, Evidence, Recommendation, SyllabusSummary } from "../lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CATEGORIES: { id: Recommendation["category"] | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "TEACHING_METHODS", label: "Teaching methods" },
  { id: "ASSESSMENT", label: "Assessment" },
  { id: "CONTENT_ENHANCEMENT", label: "Content enhancement" },
];

function StartPanel({
  preselected,
  autostart = false,
}: {
  preselected: string;
  autostart?: boolean;
}) {
  const navigate = useNavigate();
  const [syllabi, setSyllabi] = useState<SyllabusSummary[] | null>(null);
  const [selected, setSelected] = useState(preselected);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  // Reused when a failed request is retried, so a lost response can't start a second job.
  const keyRef = useRef<{ syllabus: string; key: string } | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    api<SyllabusSummary[]>("/api/syllabi")
      .then((list) => {
        const confirmed = list.filter((s) => s.status === "CONFIRMED");
        setSyllabi(confirmed);
        if (!preselected && confirmed[0]) setSelected(confirmed[0].syllabus_id);
      })
      .catch((e: Error) => setError(e.message));
  }, [preselected]);

  async function beginAnalysis(syllabusId: string) {
    if (!syllabusId || starting) return;
    if (keyRef.current?.syllabus !== syllabusId) {
      keyRef.current = { syllabus: syllabusId, key: newIdempotencyKey() };
    }
    setStarting(true);
    setError("");
    try {
      const job = await api<Analysis>("/api/analyses", {
        method: "POST",
        headers: { "Idempotency-Key": keyRef.current.key },
        body: JSON.stringify({ syllabus_id: syllabusId }),
      });
      keyRef.current = null;
      navigate(`/recommendations?analysis=${job.analysis_id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
      autoStartedRef.current = false;
    }
  }

  useEffect(() => {
    if (!autostart || !preselected || autoStartedRef.current) return;
    // Wait until the syllabus list loads so we know the id is confirmed (or surface empty state).
    if (syllabi === null) return;
    if (syllabi.length === 0) return;
    const exists = syllabi.some((s) => s.syllabus_id === preselected);
    if (!exists) {
      setError("That syllabus isn't ready for analysis yet. Confirm it on Upload, then try again.");
      return;
    }
    autoStartedRef.current = true;
    void beginAnalysis(preselected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot autostart for Generate CTA
  }, [autostart, preselected, syllabi]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await beginAnalysis(selected);
  }

  if (syllabi && syllabi.length === 0) {
    return (
      <Card className="product-panel border-0">
        <CardHeader>
          <CardTitle>Upload a syllabus first</CardTitle>
          <CardDescription>
            PHACT only analyzes text you've checked and confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/upload">
              <FileUp aria-hidden="true" />
              Upload syllabus
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (autostart && (starting || (!error && preselected))) {
    return (
      <Card className="product-panel border-0">
        <CardHeader>
          <CardTitle>Starting AI recommendations</CardTitle>
          <CardDescription>
            Screening your confirmed syllabus and launching the analysis — this page will update
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="privacy-line">
            <ShieldCheck aria-hidden="true" />
            Names, emails, and phone numbers are removed before the AI reads the text.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {error && (
            <Button type="button" onClick={() => void beginAnalysis(preselected || selected)}>
              <Sparkles aria-hidden="true" />
              Try again
            </Button>
          )}
          {!error && (
            <div className="product-loading" role="status">
              <span className="spinner" aria-hidden="true" />
              Screening and starting…
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="product-panel border-0">
      <CardHeader>
        <CardTitle>Start a new analysis</CardTitle>
        <CardDescription>
          Pick a confirmed syllabus to generate cited weekly enhancements and assignment drafts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="form-stack start-panel" onSubmit={start}>
          <div className="space-y-2">
            <Label htmlFor="confirmed-syllabus">Confirmed syllabus</Label>
            <Select
              value={selected || undefined}
              onValueChange={setSelected}
              disabled={!syllabi}
            >
              <SelectTrigger
                id="confirmed-syllabus"
                className="w-full h-11 product-select-trigger"
                data-cursor="interactive"
              >
                <SelectValue placeholder="Choose a syllabus…" />
              </SelectTrigger>
              <SelectContent>
                {syllabi?.map((s) => (
                  <SelectItem key={s.syllabus_id} value={s.syllabus_id}>
                    {courseLabel(s.course_code, s.title)} — {formatDate(s.created_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="privacy-line">
            <ShieldCheck aria-hidden="true" />
            Names, emails, and phone numbers are removed and the text is screened before the AI reads
            it. Results are drafts until you approve them.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <Button type="submit" disabled={starting || !selected} data-cursor="interactive">
              <Sparkles aria-hidden="true" />
              {starting ? "Screening and starting…" : "Generate recommendations"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function hasAssignment(rec: Recommendation) {
  const a = rec.assignment;
  if (!a) return false;
  return Boolean(a.title || a.student_prompt || a.deliverable || a.ai_policy);
}

function RecommendationCard({
  rec,
  evidence,
  index,
}: {
  rec: Recommendation;
  evidence: Evidence[];
  index: number;
}) {
  return (
    <motion.article
      className={`rec-card product-rec-card${rec.excluded ? " excluded" : ""}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.35), duration: 0.35 }}
      whileHover={{ y: -3 }}
    >
      <div className="rec-card-head">
        <Badge variant="soft">{CATEGORY_LABELS[rec.category] ?? rec.category}</Badge>
        {rec.approach === "AI_RESISTANT" && (
          <Badge variant="outline" title="Protects learning with oral, handwritten, or in-person work">
            AI-resistant
          </Badge>
        )}
        {rec.excluded && <Badge variant="orange">Excluded by reviewer</Badge>}
        <span className="rec-target">{rec.target}</span>
      </div>
      <h3>{rec.title}</h3>
      {(rec.proposed_change || "").trim() && (
        <div className="proposed-change-chip">
          <span className="proposed-change-label">Syllabus PDF line</span>
          <p className="proposed-change-text">{rec.proposed_change}</p>
        </div>
      )}
      <p className="rec-body">{rec.recommendation}</p>
      <RecDetailTabs
        courseworkDescription={rec.coursework_description}
        rationale={rec.rationale}
      />
      {rec.implementation_steps.length > 0 && (
        <div className="rec-section">
          <h4>How to implement</h4>
          <ol>
            {rec.implementation_steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {hasAssignment(rec) && rec.assignment && (
        <div className="rec-section assignment-preview">
          <h4>Assessment structure</h4>
          {rec.assignment.title && <p className="assignment-title">{rec.assignment.title}</p>}
          {rec.assignment.student_prompt && (
            <p className="assignment-prompt">{rec.assignment.student_prompt}</p>
          )}
          <dl className="assignment-meta">
            {rec.assignment.deliverable && (
              <>
                <dt>Weight / deliverable</dt>
                <dd>{rec.assignment.deliverable}</dd>
              </>
            )}
            {rec.assignment.ai_policy && (
              <>
                <dt>AI use</dt>
                <dd>{rec.assignment.ai_policy}</dd>
              </>
            )}
          </dl>
        </div>
      )}
      <Separator className="my-3" />
      <div className="rec-section evidence">
        <h4>Evidence</h4>
        <Citations refs={rec.citations} evidence={evidence} status={rec.evidence_status} />
      </div>
    </motion.article>
  );
}

export default function RecommendationsPage() {
  const [params] = useSearchParams();
  const preselected = params.get("syllabus") ?? "";
  const autostart = params.get("start") === "1";
  const showStart = !params.get("analysis") && (!!preselected || params.get("new") === "1");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("ALL");

  return (
    <WorkflowPage
      title="Course enhancement recommendations"
      description="First-pass updates focus on weekly course enhancement and assignments, shaped by your industry vs research selection. Regenerate with feedback anytime to change direction."
      showStart={showStart}
      startPanel={<StartPanel preselected={preselected} autostart={autostart} />}
      actions={
        !showStart && (
          <Button asChild variant="secondary" size="sm">
            <Link to="/recommendations?new=1">
              <Plus aria-hidden="true" />
              New analysis
            </Link>
          </Button>
        )
      }
    >
      {({ analysis, revision, reload }) => {
        const part = revision?.content.recommendations;
        const regenerating =
          analysis.job_status === "QUEUED" ||
          analysis.job_status === "RUNNING" ||
          analysis.parts.recommendations.status !== "SUCCEEDED";
        if (!part || regenerating) {
          return <JobProgress analysis={analysis} onChanged={() => void reload()} />;
        }
        const recs = part.recommendations.filter(
          (r) => category === "ALL" || r.category === category,
        );
        return (
          <>
            <JobProgress analysis={analysis} onChanged={() => void reload()} compact />
            <Card className="summary-panel product-panel border-0 overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl text-[var(--phact-navy)]">
                      {analysis.course_title}
                    </CardTitle>
                    {(analysis.grade_level_label ||
                      analysis.course_focus_label ||
                      analysis.term_label) && (
                      <ul className="context-chips left mt-2" aria-label="Course context">
                        {analysis.grade_level_label && <li>{analysis.grade_level_label}</li>}
                        {analysis.course_focus_label && <li>{analysis.course_focus_label}</li>}
                        {analysis.term_label && <li>{analysis.term_label}</li>}
                      </ul>
                    )}
                  </div>
                  <Badge variant="teal">{part.recommendations.length} recommendations</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="body-copy">{part.course_summary}</p>
                <p className="privacy-line">
                  <ShieldCheck aria-hidden="true" />
                  {privacySummary(analysis.redactions)}
                </p>
              </CardContent>
            </Card>

            <Tabs
              value={category}
              onValueChange={(v) => setCategory(v as (typeof CATEGORIES)[number]["id"])}
              className="product-filter-tabs"
            >
              <TabsList className="h-auto flex-wrap justify-start gap-1 bg-[rgba(243,247,249,0.95)] p-1.5">
                {CATEGORIES.map((c) => {
                  const count =
                    c.id === "ALL"
                      ? part.recommendations.length
                      : part.recommendations.filter((r) => r.category === c.id).length;
                  return (
                    <TabsTrigger
                      key={c.id}
                      value={c.id}
                      className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[var(--phact-navy)]"
                    >
                      {c.label}
                      <span className="rounded-full bg-[var(--phact-teal-soft)] px-1.5 text-[11px] font-bold text-[var(--phact-navy)]">
                        {count}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            <div className="rec-grid">
              {recs.map((rec, i) => (
                <RecommendationCard key={rec.id} rec={rec} evidence={part.evidence} index={i} />
              ))}
              {recs.length === 0 && (
                <Card className="product-panel border-0">
                  <CardContent className="py-8 text-center text-[var(--phact-muted)]">
                    No recommendations in this category.
                  </CardContent>
                </Card>
              )}
            </div>

            {part.evidence_gaps.length > 0 && (
              <Card className="product-panel border-0">
                <CardHeader>
                  <CardTitle>Where the evidence ran out</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="plain-list">
                    {part.evidence_gaps.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="next-step">
              <Button asChild>
                <Link to={`/review?analysis=${analysis.analysis_id}`}>
                  Review and approve
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={`/competencies?analysis=${analysis.analysis_id}`}>
                  See competency mapping
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </>
        );
      }}
    </WorkflowPage>
  );
}
