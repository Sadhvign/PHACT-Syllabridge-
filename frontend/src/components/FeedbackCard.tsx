import { Star } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import type { Feedback } from "../lib/types";

function Stars({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="stars">
      <legend>{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? "star on" : "star"}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={n <= value}
        >
          <Star aria-hidden="true" />
        </button>
      ))}
    </fieldset>
  );
}

export default function FeedbackCard({
  analysisId,
  initial,
}: {
  analysisId: string;
  initial: Feedback | null;
}) {
  const [experience, setExperience] = useState(initial?.experience_rating ?? 0);
  const [usefulness, setUsefulness] = useState(initial?.usefulness_rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [saved, setSaved] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/analyses/${analysisId}/feedback`, {
        method: "PUT",
        body: JSON.stringify({
          experience_rating: experience,
          usefulness_rating: usefulness,
          comment,
        }),
      });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel feedback-card" onSubmit={submit}>
      <h2 className="panel-title">Share your feedback</h2>
      <Stars label="How was your experience?" value={experience} onChange={(v) => { setExperience(v); setSaved(false); }} />
      <Stars label="How useful were the recommendations?" value={usefulness} onChange={(v) => { setUsefulness(v); setSaved(false); }} />
      <label>
        Comments (optional)
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => { setComment(e.target.value); setSaved(false); }}
          maxLength={2000}
          placeholder="What worked well? What should we improve?"
        />
      </label>
      <button className="button primary" disabled={busy || !experience || !usefulness || saved}>
        {busy ? "Sending…" : saved ? "Thanks for your feedback" : "Submit feedback"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
