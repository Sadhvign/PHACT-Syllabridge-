import {
  Download,
  Menu,
  Minus,
  Plus,
  Printer,
  RotateCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { AssignmentPreview, Recommendation } from "../lib/types";

export type PreviewRec = {
  id: string;
  title: string;
  target: string;
  proposed_change?: string;
  recommendation: string;
  category?: string;
  approach?: string;
  assignment?: AssignmentPreview;
  citations?: string[];
  excluded?: boolean;
};

type PreviewLine = {
  key: string;
  text: string;
  recId?: string;
  original?: string;
  blank?: boolean;
};

function findLineIndex(lines: string[], target: string): number {
  const needle = target.trim().toLowerCase();
  if (!needle) return -1;
  const exact = lines.findIndex((l) => l.toLowerCase().includes(needle));
  if (exact >= 0) return exact;
  const tokens = needle.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (!tokens.length) return -1;
  let best = -1;
  let bestScore = 0;
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    const hay = l.toLowerCase();
    const score = tokens.filter((t) => hay.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= Math.min(2, tokens.length) ? best : -1;
}

const WEEK_RE = /\bweek\s*(\d{1,2})\b/i;
const ESSAY_START =
  /^(introduce|integrate|build|develop|create|design|implement|students will|this (helps|change|update)|use ai|recommend)\b/i;

function weekPrefix(target: string, proposed: string): string | null {
  for (const source of [proposed, target]) {
    const m = source.match(WEEK_RE);
    if (m) return `Week ${Number(m[1])}`;
  }
  return null;
}

function shortTopic(text: string): string {
  let cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.includes(":") && WEEK_RE.test(cleaned)) {
    cleaned = cleaned.split(":").slice(1).join(":").trim();
  }
  cleaned = cleaned.replace(ESSAY_START, "").replace(/^[-–—:\s]+/, "");
  for (const sep of [". ", "; ", " — ", " - ", ", and ", " with "]) {
    if (cleaned.includes(sep) && cleaned.length > 70) {
      cleaned = cleaned.split(sep)[0].trim();
      break;
    }
  }
  return cleaned.replace(/[.;,:]+$/, "").slice(0, 70);
}

/** PDF body may only show clean week/assessment lines — never panel explanations. */
function pdfLineFor(rec: PreviewRec): string {
  const proposed = (rec.proposed_change || "").trim();
  const target = (rec.target || "").trim();
  const assignment = rec.assignment;
  const looksAssessment =
    /assessment|exam|project|problem set|midterm|final|grading/i.test(target) ||
    Boolean(assignment?.title && assignment?.deliverable);

  if (looksAssessment) {
    const first = proposed.split("\n")[0]?.trim() || "";
    if (first && first.length <= 90 && !ESSAY_START.test(first) && first.includes(":")) {
      return first.slice(0, 100);
    }
    const name = (assignment?.title || rec.title || target).trim();
    const weight = (assignment?.deliverable || "").trim();
    if (weight && weight.length <= 40) return `${name}: ${weight}`.slice(0, 100);
    return name.slice(0, 100);
  }

  const week = weekPrefix(target, proposed);
  const source =
    proposed && proposed.length <= 120 && !ESSAY_START.test(proposed.split("\n")[0] || "")
      ? proposed
      : rec.title || proposed || target;
  const topic = shortTopic(source) || shortTopic(rec.title || "") || "Updated topic";
  if (week) return `${week}: ${topic}`.slice(0, 90);
  if (target.includes(":") && target.length <= 90 && !ESSAY_START.test(target)) {
    return `${target.split(":")[0].trim()}: ${topic}`.slice(0, 90);
  }
  return topic.slice(0, 90);
}

/** Apply short syllabus deltas in place — like editing EPI/MAE week and assessment lines. */
function buildPreviewLines(text: string, recs: PreviewRec[]): PreviewLine[] {
  const sourceLines = text.replace(/\r\n/g, "\n").split("\n");
  const working = [...sourceLines];
  const owners: (string | undefined)[] = working.map(() => undefined);
  const originals: (string | undefined)[] = working.map(() => undefined);

  const included = recs.filter((r) => !r.excluded);
  const unmatched: PreviewRec[] = [];

  included.forEach((rec) => {
    const idx = findLineIndex(working, rec.target);
    const replacement = pdfLineFor(rec);
    if (idx < 0 || !replacement) {
      unmatched.push(rec);
      return;
    }
    // Replace the matched syllabus line in place — never insert essay blocks.
    const parts = replacement
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 4);
    originals[idx] = working[idx];
    working[idx] = parts[0] || replacement;
    owners[idx] = rec.id;
    // Multi-line grading updates only (2–4 short lines), still compact.
    if (parts.length > 1 && parts.every((p) => p.length <= 100)) {
      working.splice(idx + 1, 0, ...parts.slice(1));
      originals.splice(idx + 1, 0, ...parts.slice(1).map(() => undefined));
      owners.splice(idx + 1, 0, ...parts.slice(1).map(() => rec.id));
    }
  });

  const lines: PreviewLine[] = working.map((textLine, i) => ({
    key: `l-${i}`,
    text: textLine,
    blank: !textLine.trim(),
    recId: owners[i],
    original: originals[i],
  }));

  // Append unmatched updates as a short "Proposed schedule updates" list — one clean line each.
  if (unmatched.length) {
    lines.push({ key: "gap-proposed", text: "", blank: true });
    lines.push({ key: "proposed-head", text: "Proposed schedule updates" });
    unmatched.forEach((rec) => {
      const replacement = pdfLineFor(rec);
      if (!replacement) return;
      lines.push({
        key: `u-${rec.id}`,
        text: replacement.split("\n")[0].slice(0, 90),
        recId: rec.id,
        original: rec.target || undefined,
      });
    });
  }

  return lines;
}

function fromRecommendation(r: Recommendation, draft?: Partial<PreviewRec>): PreviewRec {
  return {
    id: r.id,
    title: draft?.title ?? r.title,
    target: draft?.target ?? r.target,
    proposed_change: draft?.proposed_change ?? r.proposed_change,
    recommendation: draft?.recommendation ?? r.recommendation,
    category: r.category,
    approach: r.approach,
    assignment: draft?.assignment ?? r.assignment,
    citations: r.citations,
    excluded: draft?.excluded ?? !!r.excluded,
  };
}

export function draftsToPreviewRecs(
  recs: Recommendation[],
  drafts?: Record<
    string,
    {
      title: string;
      target: string;
      proposed_change?: string;
      recommendation: string;
      assignment?: AssignmentPreview;
      excluded?: boolean;
    }
  >,
): PreviewRec[] {
  return recs.map((r) => fromRecommendation(r, drafts?.[r.id]));
}

type Props = {
  analysisId: string;
  courseTitle?: string;
  courseCode?: string;
  fileName?: string;
  recommendations: PreviewRec[];
  selectedRecId?: string;
  onSelectRec?: (id: string) => void;
  compact?: boolean;
  standalone?: boolean;
};

export default function SyllabusPdfPreview({
  analysisId,
  courseTitle,
  courseCode,
  fileName,
  recommendations,
  selectedRecId = "",
  onSelectRec,
  compact = false,
  standalone = false,
}: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [pulseId, setPulseId] = useState("");
  const targetRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    api<{ text: string }>(`/api/analyses/${analysisId}/input`)
      .then((r) => setText(r.text))
      .catch((e: ApiError) => setError(e.message));
  }, [analysisId]);

  const lines = useMemo(
    () => (text ? buildPreviewLines(text, recommendations) : []),
    [text, recommendations],
  );

  const includedCount = recommendations.filter((r) => !r.excluded).length;
  const selected = recommendations.find((r) => r.id === selectedRecId);

  useEffect(() => {
    if (!selectedRecId) return;
    const el = targetRefs.current[selectedRecId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setPulseId(selectedRecId);
    const t = window.setTimeout(() => setPulseId(""), 1400);
    return () => window.clearTimeout(t);
  }, [selectedRecId, lines]);

  const displayName =
    fileName ||
    `PHACT-${(courseCode || courseTitle || "syllabus").replace(/\s+/g, "-").slice(0, 28)}-preview.pdf`;

  return (
    <aside
      className={`panel pdf-preview${standalone ? " pdf-preview-standalone" : ""}${compact ? " pdf-preview-compact" : ""}`}
      aria-label="Syllabus PDF preview"
    >
      <div className="syllabus-pane-head">
        <h2 className="panel-title">Syllabus preview</h2>
        {selected ? (
          <p className="muted small map-hint">Highlighting update: {selected.target || selected.title}</p>
        ) : (
          <p className="muted small map-hint">
            Click a recommendation to highlight its week or assessment line in the PDF.
          </p>
        )}
      </div>

      <div className="pdf-chrome">
        <div className="pdf-toolbar" role="toolbar" aria-label="Preview controls">
          <Menu aria-hidden="true" className="pdf-toolbar-icon" />
          <span className="pdf-filename" title={displayName}>
            {displayName}
          </span>
          <span className="pdf-page-meta">
            Live · {includedCount} update{includedCount === 1 ? "" : "s"}
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="pdf-tool-btn"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(80, z - 10))}
          >
            <Minus aria-hidden="true" />
          </button>
          <span className="pdf-zoom">{zoom}%</span>
          <button
            type="button"
            className="pdf-tool-btn"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(140, z + 10))}
          >
            <Plus aria-hidden="true" />
          </button>
          <RotateCw aria-hidden="true" className="pdf-toolbar-icon muted-icon" />
          <Sparkles aria-hidden="true" className="pdf-toolbar-icon muted-icon" />
          <Search aria-hidden="true" className="pdf-toolbar-icon muted-icon" />
          <Download aria-hidden="true" className="pdf-toolbar-icon muted-icon" />
          <Printer aria-hidden="true" className="pdf-toolbar-icon muted-icon" />
        </div>

        <div className="pdf-stage">
          {error ? (
            <p className="hint">{error}</p>
          ) : text === null ? (
            <p className="hint">Loading preview…</p>
          ) : (
            <div className="pdf-page pdf-page-syllabus" style={{ fontSize: `${13 * (zoom / 100)}px` }}>
              {(courseTitle || courseCode) && (
                <header className="pdf-doc-header">
                  {courseCode && <p className="pdf-course-code">{courseCode}</p>}
                  {courseTitle && <h3 className="pdf-course-title">{courseTitle}</h3>}
                  <p className="pdf-doc-sub">
                    Clean syllabus only (weeks, grading, assignments). Why each change was made is on
                    the right — not in this PDF.
                  </p>
                </header>
              )}

              <div className="pdf-syllabus-body">
                {lines.map((line) => {
                  if (line.blank) {
                    return <div key={line.key} className="pdf-syllabus-gap" />;
                  }
                  const active = !!line.recId && line.recId === selectedRecId;
                  const changed = !!line.recId;
                  const pulsing = !!line.recId && pulseId === line.recId;
                  return (
                    <p
                      key={line.key}
                      ref={(el) => {
                        if (line.recId && !targetRefs.current[line.recId]) {
                          targetRefs.current[line.recId] = el;
                        }
                        if (line.recId && active) targetRefs.current[line.recId] = el;
                      }}
                      className={`pdf-syllabus-line${changed ? " is-changed" : ""}${active ? " is-mapped" : ""}${pulsing ? " is-pulse" : ""}`}
                      onClick={() => line.recId && onSelectRec?.(line.recId)}
                      role={line.recId && onSelectRec ? "button" : undefined}
                      tabIndex={line.recId && onSelectRec ? 0 : undefined}
                      title={line.original ? `Was: ${line.original}` : undefined}
                      onKeyDown={
                        line.recId && onSelectRec
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectRec(line.recId!);
                              }
                            }
                          : undefined
                      }
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>

              {includedCount === 0 && (
                <p className="hint pdf-empty-hint">
                  Include recommendations to apply short week/assessment updates in this preview.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
