import { AlertTriangle, BookOpen } from "lucide-react";
import { useState } from "react";
import type { Evidence, EvidenceStatus } from "../lib/types";

type Props = {
  refs: string[];
  evidence: Evidence[];
  status: EvidenceStatus;
};

export default function Citations({ refs, evidence, status }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const byRef = new Map(evidence.map((e) => [e.ref, e]));

  if (status === "INSUFFICIENT_EVIDENCE" || refs.length === 0) {
    return (
      <p className="evidence-missing">
        <AlertTriangle aria-hidden="true" />
        No approved ASPPH source supports this item. Treat it as the AI's suggestion only.
      </p>
    );
  }

  const shown = open ? byRef.get(open) : null;
  const perTitle = new Map<string, number>();
  refs.forEach((ref) => {
    const title = byRef.get(ref)?.title ?? ref;
    perTitle.set(title, (perTitle.get(title) ?? 0) + 1);
  });
  const seen = new Map<string, number>();
  const labelFor = (ref: string) => {
    const title = byRef.get(ref)?.title ?? ref;
    if ((perTitle.get(title) ?? 0) < 2) return title;
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return `${title} · excerpt ${n}`;
  };
  return (
    <div className="citations">
      <div className="citation-chips">
        <BookOpen aria-hidden="true" />
        {refs.map((ref) => {
          const source = byRef.get(ref);
          return (
            <button
              key={ref}
              type="button"
              className={`citation-chip${open === ref ? " open" : ""}`}
              aria-expanded={open === ref}
              onClick={() => setOpen(open === ref ? null : ref)}
              title={source?.title}
            >
              {labelFor(ref)}
            </button>
          );
        })}
      </div>
      {shown && (
        <blockquote className="citation-excerpt">
          <p>{shown.excerpt}</p>
          <footer>
            {shown.title} · {shown.source_type} · source version {shown.version}
          </footer>
        </blockquote>
      )}
    </div>
  );
}
