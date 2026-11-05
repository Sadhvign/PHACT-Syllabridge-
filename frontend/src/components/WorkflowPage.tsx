import { FileUp } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAnalysis, useSelectedAnalysis } from "../lib/analysis";
import type { Analysis, Revision } from "../lib/types";
import AnalysisBar from "./AnalysisBar";
import { MotionItem, PageMotion } from "./motion";
import PageHeader from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type WorkflowContext = {
  analysis: Analysis;
  revision: Revision | null;
  reload: () => Promise<void>;
  refreshList: () => void;
};

type Props = {
  title: string;
  description: string;
  /** Shown instead of auto-selecting the latest analysis, e.g. the start form. */
  startPanel?: ReactNode;
  showStart?: boolean;
  actions?: ReactNode;
  children: (ctx: WorkflowContext) => ReactNode;
};

export default function WorkflowPage({
  title,
  description,
  startPanel,
  showStart = false,
  actions,
  children,
}: Props) {
  const { analysisId, analyses, select, refreshList } = useSelectedAnalysis();
  const { analysis, revision, error, reload } = useAnalysis(showStart ? null : analysisId);

  useEffect(() => {
    if (!showStart && !analysisId && analyses?.length) select(analyses[0].analysis_id);
  }, [showStart, analysisId, analyses, select]);

  useEffect(() => {
    if (analysis) refreshList();
  }, [analysis?.job_status, analysis?.latest_revision, refreshList]); // eslint-disable-line react-hooks/exhaustive-deps

  const noAnalyses = analyses !== null && analyses.length === 0;

  return (
    <PageMotion className="page product-page">
      <PageHeader title={title} description={description} actions={actions} />

      {showStart || (noAnalyses && startPanel) ? (
        <MotionItem>{startPanel}</MotionItem>
      ) : noAnalyses ? (
        <MotionItem>
          <Card className="product-panel empty">
            <CardContent className="flex flex-col items-start gap-4 p-8">
              <p>You haven&apos;t analyzed a syllabus yet.</p>
              <Button asChild variant="orange">
                <Link to="/recommendations?new=1">
                  <FileUp aria-hidden="true" />
                  Start an analysis
                </Link>
              </Button>
            </CardContent>
          </Card>
        </MotionItem>
      ) : (
        <>
          <MotionItem>
            <AnalysisBar analyses={analyses} analysis={analysis} onSelect={select} />
          </MotionItem>
          {error && !analysis && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!analysis && !error && (
            <MotionItem>
              <div className="panel loading-panel product-loading" role="status">
                <span className="spinner" aria-hidden="true" />
                Loading analysis…
              </div>
            </MotionItem>
          )}
          {analysis && (
            <MotionItem className="product-workflow-body">
              {children({ analysis, revision, reload, refreshList })}
            </MotionItem>
          )}
        </>
      )}
    </PageMotion>
  );
}
