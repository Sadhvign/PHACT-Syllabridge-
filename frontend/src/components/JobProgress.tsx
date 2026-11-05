import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { isActive, privacySummary } from "../lib/analysis";
import type { Analysis, PartName, PartView } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const PART_LABELS: Record<PartName, string> = {
  recommendations: "AI integration recommendations",
  competencies: "Competency mapping",
};

const STAGE_LABELS: Record<string, string> = {
  RETRIEVING_SOURCES: "Searching approved ASPPH sources…",
  GENERATING: "Writing cited results…",
  REFINING: "Refining from your feedback…",
  CONSULTING_TOOLS: "Consulting sources and tools…",
};

function partState(part: PartView) {
  if (part.status === "SUCCEEDED")
    return { icon: CheckCircle2, tone: "success", text: "Done", progress: 100 };
  if (part.status === "FAILED")
    return {
      icon: AlertTriangle,
      tone: "danger",
      text: part.message || "This part didn't finish.",
      progress: 100,
    };
  if (part.status === "RUNNING")
    return {
      icon: Loader2,
      tone: "running",
      text: STAGE_LABELS[part.stage] ?? "Starting…",
      progress: part.stage === "GENERATING" || part.stage === "REFINING" ? 72 : 38,
    };
  return { icon: Clock, tone: "neutral", text: "Waiting to start", progress: 8 };
}

type Props = {
  analysis: Analysis;
  onChanged: () => void;
  compact?: boolean;
};

export default function JobProgress({ analysis, onChanged, compact = false }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const active = isActive(analysis);
  const failedParts = (Object.keys(analysis.parts) as PartName[]).filter(
    (p) => analysis.parts[p].status === "FAILED",
  );
  const refineLabel =
    (analysis.refine_count ?? 0) > 0 || !!analysis.faculty_feedback
      ? `Refine ${analysis.refine_count ?? 1} of ${analysis.max_refines ?? 8}`
      : analysis.attempt > 1
        ? `Attempt ${analysis.attempt} of ${analysis.max_attempts}`
        : "";

  async function retry() {
    setRetrying(true);
    setError("");
    try {
      await api(`/api/analyses/${analysis.analysis_id}/retry`, { method: "POST" });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  if (compact && !active && failedParts.length === 0) return null;

  return (
    <Card className="job-progress product-panel border-0" aria-live="polite">
      <CardHeader className="pb-2">
        <div className="job-progress-head flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {active
              ? "Analyzing your syllabus"
              : failedParts.length
                ? "Part of the analysis didn't finish"
                : "Analysis complete"}
          </CardTitle>
          {refineLabel && <span className="muted small">{refineLabel}</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="part-list product-part-list">
          {(Object.keys(PART_LABELS) as PartName[]).map((name, i) => {
            const part = analysis.parts[name];
            const state = partState(part);
            const Icon = state.icon;
            return (
              <motion.li
                key={name}
                className={`part-row ${state.tone}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Icon aria-hidden="true" className={state.tone === "running" ? "spin" : undefined} />
                <span className="min-w-0 flex-1">
                  <strong>{PART_LABELS[name]}</strong>
                  <small>{state.text}</small>
                  <Progress
                    value={state.progress}
                    className={`mt-2 h-1.5 ${state.tone === "running" ? "animate-pulse" : ""}`}
                  />
                </span>
              </motion.li>
            );
          })}
        </ul>
        {active && (
          <p className="hint">
            This usually takes about a minute. You can leave this page; the analysis keeps running
            and you can come back to it from the dashboard.
          </p>
        )}
        {!active && failedParts.length > 0 && (
          <div className="actions">
            {analysis.can_retry ? (
              <Button type="button" onClick={retry} disabled={retrying}>
                <RotateCcw aria-hidden="true" />
                {retrying ? "Retrying…" : "Retry failed parts"}
              </Button>
            ) : (
              <p className="hint">
                This analysis has used all automatic retries. Start a new analysis from an uploaded
                syllabus, or regenerate with feedback from Review.
              </p>
            )}
            <Button asChild variant="secondary">
              <Link to={`/upload?syllabus=${analysis.syllabus_id}`}>
                <RefreshCw aria-hidden="true" />
                Back to syllabus
              </Link>
            </Button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="privacy-line">
          <ShieldCheck aria-hidden="true" />
          {privacySummary(analysis.redactions)}
        </p>
      </CardContent>
    </Card>
  );
}
