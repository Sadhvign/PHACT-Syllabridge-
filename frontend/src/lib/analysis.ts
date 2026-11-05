import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import type { Analysis, JobStatus, Revision } from "./types";

export const ACTIVE_STATES: JobStatus[] = ["QUEUED", "RUNNING"];

export const JOB_STATUS_BADGES: Record<JobStatus, { label: string; tone: string }> = {
  QUEUED: { label: "Queued", tone: "neutral" },
  RUNNING: { label: "Analyzing", tone: "info" },
  SUCCEEDED: { label: "Complete", tone: "success" },
  PARTIALLY_SUCCEEDED: { label: "Partly complete", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const REVIEW_BADGES: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Awaiting review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const SUBMISSION_BADGES: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Pending ASPPH review", tone: "warning" },
  ACCEPTED: { label: "Accepted to repository", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
};

export const CATEGORY_LABELS: Record<string, string> = {
  TEACHING_METHODS: "Teaching methods",
  ASSESSMENT: "Assessment",
  CONTENT_ENHANCEMENT: "Content enhancement",
};

export const COVERAGE_BADGES: Record<string, { label: string; tone: string }> = {
  STRONG: { label: "Strong", tone: "success" },
  PARTIAL: { label: "Partial", tone: "warning" },
  GAP: { label: "Gap", tone: "danger" },
};

const REDACTION_LABELS: Record<string, string> = {
  NAME: "name",
  EMAIL: "email address",
  PHONE: "phone number",
  ADDRESS: "address",
};

export function privacySummary(redactions: Record<string, number>): string {
  const entries = Object.entries(redactions).filter(([, n]) => n > 0);
  if (!entries.length) return "No personal details were found in the syllabus text.";
  const parts = entries.map(([type, n]) => {
    const label = REDACTION_LABELS[type] ?? type.toLowerCase().replace(/_/g, " ");
    return `${n} ${label}${n === 1 ? "" : "s"}`;
  });
  return `Removed ${parts.join(", ")} before the AI saw the text.`;
}

export function isActive(analysis: Analysis | null): boolean {
  return !!analysis && ACTIVE_STATES.includes(analysis.job_status);
}

/** Keeps the selected analysis in the URL so a reload or shared tab resumes it. */
export function useSelectedAnalysis() {
  const [params, setParams] = useSearchParams();
  const analysisId = params.get("analysis");
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);

  const refreshList = useCallback(() => {
    api<Analysis[]>("/api/analyses")
      .then(setAnalyses)
      .catch(() => setAnalyses([]));
  }, []);

  useEffect(refreshList, [refreshList]);

  const select = useCallback(
    (id: string | null) => {
      setParams(id ? { analysis: id } : {}, { replace: true });
    },
    [setParams],
  );

  return { analysisId, analyses, select, refreshList, params, setParams };
}

/** Loads an analysis and polls with backoff until it reaches a final state. */
type AnalysisState = {
  id: string | null;
  analysis: Analysis | null;
  revision: Revision | null;
  error: string;
};

const EMPTY_STATE: AnalysisState = { id: null, analysis: null, revision: null, error: "" };

export function useAnalysis(analysisId: string | null) {
  const [state, setState] = useState<AnalysisState>(EMPTY_STATE);
  const [nonce, setNonce] = useState(0);
  const waiters = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;
    let loadedRevision = 0;

    async function tick() {
      try {
        const next = await api<Analysis>(`/api/analyses/${analysisId}`);
        let rev: Revision | null = null;
        if (next.latest_revision > 0 && loadedRevision !== next.latest_revision) {
          rev = await api<Revision>(`/api/analyses/${analysisId}/revisions/${next.latest_revision}`);
          loadedRevision = next.latest_revision;
        }
        if (cancelled) return;
        setState((prev) => ({
          id: analysisId,
          analysis: next,
          revision: rev ?? (prev.id === analysisId ? prev.revision : null),
          error: "",
        }));
        waiters.current.splice(0).forEach((resolve) => resolve());
        if (ACTIVE_STATES.includes(next.job_status)) {
          polls += 1;
          timer = window.setTimeout(() => void tick(), Math.min(2000 * 1.4 ** polls, 10000));
        }
      } catch (e) {
        if (cancelled) return;
        const message = (e as Error).message;
        setState((prev) => ({ ...(prev.id === analysisId ? prev : EMPTY_STATE), id: analysisId, error: message }));
        waiters.current.splice(0).forEach((resolve) => resolve());
        timer = window.setTimeout(() => void tick(), 10000);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [analysisId, nonce]);

  /** Re-fetches the analysis and its latest revision; resolves once fresh data is shown. */
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiters.current.push(resolve);
        setNonce((n) => n + 1);
      }),
    [],
  );

  const current = state.id === analysisId ? state : EMPTY_STATE;
  return { analysis: current.analysis, revision: current.revision, error: current.error, reload };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
