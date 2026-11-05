import { CheckCircle2, Network, Share2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { JOB_STATUS_BADGES, REVIEW_BADGES } from "../lib/analysis";
import { courseLabel, formatDate } from "../lib/format";
import type { Analysis } from "../lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  { to: "/recommendations", label: "Recommendations", icon: Sparkles },
  { to: "/competencies", label: "Competencies", icon: Network },
  { to: "/review", label: "Review & approve", icon: CheckCircle2 },
  { to: "/export", label: "Export", icon: Share2 },
];

type Props = {
  analyses: Analysis[] | null;
  analysis: Analysis | null;
  onSelect: (id: string) => void;
};

export default function AnalysisBar({ analyses, analysis, onSelect }: Props) {
  const status = analysis ? JOB_STATUS_BADGES[analysis.job_status] : null;
  const review = analysis?.review_status ? REVIEW_BADGES[analysis.review_status] : null;

  return (
    <Card className="analysis-bar product-panel overflow-hidden border-0 shadow-sm">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="analysis-bar-top">
          <label className="analysis-select">
            Analysis
            <select
              className="product-select"
              value={analysis?.analysis_id ?? ""}
              onChange={(e) => onSelect(e.target.value)}
              disabled={!analyses?.length}
            >
              {!analysis && <option value="">Loading…</option>}
              {analyses?.map((a) => (
                <option key={a.analysis_id} value={a.analysis_id}>
                  {courseLabel(a.course_code, a.course_title)} — {formatDate(a.created_at)}
                </option>
              ))}
            </select>
          </label>
          <div className="analysis-badges flex flex-wrap gap-2">
            {status && (
              <Badge variant={status.tone === "success" ? "teal" : status.tone === "warning" ? "orange" : "soft"}>
                {status.label}
              </Badge>
            )}
            {review && analysis?.latest_revision ? (
              <Badge variant={review.tone === "success" ? "teal" : review.tone === "danger" ? "orange" : "outline"}>
                {review.label}
              </Badge>
            ) : null}
            {analysis && analysis.latest_revision > 0 && (
              <Badge variant="outline">Version {analysis.latest_revision}</Badge>
            )}
          </div>
        </div>
        {analysis && (
          <nav className="product-workflow-tabs" aria-label="Analysis workflow">
            {STEPS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={`${to}?analysis=${analysis.analysis_id}`}
                className={({ isActive }) => cn("product-workflow-tab", isActive && "is-active")}
              >
                {({ isActive }) => (
                  <>
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                    {isActive && (
                      <motion.span
                        layoutId="workflow-pill"
                        className="product-workflow-pill"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
