import {
  Briefcase,
  CheckCircle2,
  FileText,
  FileUp,
  FlaskConical,
  Scale,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { motion } from "framer-motion";
import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageMotion } from "../components/motion";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import type {
  CourseFocus,
  CourseTerm,
  GradeLevel,
  SyllabusDetail,
  SyllabusSummary,
  UploadTicket,
} from "../lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED = [".pdf", ".docx", ".txt"];

const GRADE_OPTIONS: { value: GradeLevel; label: string }[] = [
  { value: "BACHELORS", label: "Bachelor's" },
  { value: "MASTERS", label: "Master's" },
  { value: "PHD", label: "PhD" },
  { value: "DOCTORATE", label: "Doctorate" },
];

const FOCUS_OPTIONS: {
  value: CourseFocus;
  label: string;
  hint: string;
  icon: typeof Briefcase;
}[] = [
  {
    value: "INDUSTRY",
    label: "Industry-focused",
    hint: "Practice, workforce, applied skills",
    icon: Briefcase,
  },
  {
    value: "RESEARCH",
    label: "Research-focused",
    hint: "Methods, inquiry, scholarship",
    icon: FlaskConical,
  },
  {
    value: "BALANCED",
    label: "Balanced",
    hint: "Mix of industry and research",
    icon: Scale,
  },
];

const TERM_OPTIONS: { value: CourseTerm; label: string }[] = [
  { value: "FALL_2027", label: "Fall 2027" },
  { value: "SPRING_2027", label: "Spring 2027" },
  { value: "SUMMER_2027", label: "Summer 2027" },
];

type Stage = "idle" | "uploading" | "extracting" | "review" | "confirmed";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "extract", label: "Extract text" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
];

const STAGE_STEP: Record<Stage, number> = {
  idle: 0,
  uploading: 0,
  extracting: 1,
  review: 2,
  confirmed: 4,
};

const STATUS_BADGES: Record<string, { label: string; tone: string }> = {
  EXTRACTED: { label: "Needs review", tone: "warning" },
  EXTRACTION_FAILED: { label: "Couldn't read", tone: "danger" },
  CONFIRMED: { label: "Ready for analysis", tone: "success" },
};

function putFile(url: string, file: File, contentType: string, onProgress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("The upload was interrupted. Please try again."));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Please try again."));
    xhr.send(file);
  });
}

function validate(file: File): string {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED.includes(extension)) return "Upload a PDF, Word (.docx), or plain text file.";
  if (file.size > MAX_BYTES) return "Files must be 25 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  return "";
}

export default function UploadPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("syllabus");
  const inputRef = useRef<HTMLInputElement>(null);
  const justUploadedRef = useRef<string | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [syllabus, setSyllabus] = useState<SyllabusDetail | null>(null);
  const [title, setTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel | "">("");
  const [courseFocus, setCourseFocus] = useState<CourseFocus | "">("");
  const [term, setTerm] = useState<CourseTerm | "">("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<SyllabusSummary[] | null>(null);

  const refreshList = useCallback(() => {
    api<SyllabusSummary[]>("/api/syllabi")
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const show = useCallback((detail: SyllabusDetail) => {
    setSyllabus(detail);
    setTitle(detail.title);
    setCourseCode(detail.course_code);
    setGradeLevel((detail.grade_level as GradeLevel) || "");
    setCourseFocus((detail.course_focus as CourseFocus) || "");
    setTerm((detail.term as CourseTerm) || "");
    setText(detail.text);
    setStage(detail.status === "CONFIRMED" ? "confirmed" : "review");
  }, []);

  const reset = useCallback(() => {
    setStage("idle");
    setFile(null);
    setProgress(0);
    setSyllabus(null);
    setGradeLevel("");
    setCourseFocus("");
    setTerm("");
    setError("");
  }, []);

  useEffect(refreshList, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      // A fresh upload is shown before its id reaches the URL; don't clear it in that gap.
      if (syllabus && syllabus.syllabus_id !== justUploadedRef.current) reset();
      return;
    }
    if (selectedId === syllabus?.syllabus_id) {
      justUploadedRef.current = null;
      return;
    }
    api<SyllabusDetail>(`/api/syllabi/${selectedId}`)
      .then((detail) => {
        if (detail.status === "EXTRACTION_FAILED") {
          reset();
          setError(detail.message);
        } else {
          setError("");
          show(detail);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [selectedId, syllabus, show, reset]);

  async function handleFile(selected: File) {
    const problem = validate(selected);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setFile(selected);
    setProgress(0);
    setStage("uploading");
    try {
      const ticket = await api<UploadTicket>("/api/syllabi", {
        method: "POST",
        body: JSON.stringify({ file_name: selected.name, size_bytes: selected.size }),
      });
      await putFile(ticket.upload_url, selected, ticket.content_type, setProgress);
      setStage("extracting");
      const detail = await api<SyllabusDetail>(`/api/syllabi/${ticket.syllabus_id}/extract`, {
        method: "POST",
      });
      justUploadedRef.current = detail.syllabus_id;
      show(detail);
      setSearchParams({ syllabus: detail.syllabus_id }, { replace: true });
    } catch (e) {
      setStage("idle");
      setError((e as Error).message);
    } finally {
      refreshList();
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!syllabus) return;
    if (!gradeLevel || !courseFocus || !term) {
      setError("Select grade level, course focus, and term before confirming.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const detail = await api<SyllabusDetail>(`/api/syllabi/${syllabus.syllabus_id}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          course_code: courseCode,
          text,
          grade_level: gradeLevel,
          course_focus: courseFocus,
          term,
        }),
      });
      show(detail);
      refreshList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This removes the file and its extracted text.`)) return;
    try {
      await api<null>(`/api/syllabi/${id}`, { method: "DELETE" });
      if (syllabus?.syllabus_id === id) startOver();
      refreshList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startOver() {
    reset();
    setSearchParams({}, { replace: true });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) void handleFile(dropped);
  }

  const currentStep = STAGE_STEP[stage];
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <PageMotion className="page product-page">
      <PageHeader
        eyebrow="Course intake"
        title="Upload syllabus"
        description="Add a course syllabus to receive cited AI-integration recommendations and a competency map."
      />

      <div className="upload-layout">
        <section className="panel">
          <ol className="stepper" aria-label="Upload progress">
            {STEPS.map((step, index) => (
              <li
                key={step.id}
                className={index < currentStep ? "done" : index === currentStep ? "current" : ""}
                aria-current={index === currentStep ? "step" : undefined}
              >
                <span className="stepper-dot">
                  {index < currentStep ? <CheckCircle2 aria-hidden="true" /> : index + 1}
                </span>
                {step.label}
              </li>
            ))}
          </ol>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {stage === "idle" && (
            <motion.div
              className={`dropzone product-dropzone${dragging ? " dragging is-dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="product-dropzone-icon" aria-hidden="true">
                <UploadCloud className="dropzone-icon" />
              </span>
              <p className="dropzone-title">Drag and drop your syllabus here</p>
              <p className="muted">PDF, Word (.docx), or plain text · up to 25 MB</p>
              <Button type="button" onClick={() => inputRef.current?.click()}>
                <FileUp aria-hidden="true" />
                Browse files
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(",")}
                hidden
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  e.target.value = "";
                  if (chosen) void handleFile(chosen);
                }}
              />
            </motion.div>
          )}

          {(stage === "uploading" || stage === "extracting") && file && (
            <motion.div
              className="progress-card product-panel"
              role="status"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <FileText aria-hidden="true" />
              <div className="progress-body">
                <strong>{file.name}</strong>
                <small className="muted">
                  {formatBytes(file.size)} ·{" "}
                  {stage === "uploading" ? `Uploading ${progress}%` : "Extracting text…"}
                </small>
                <Progress
                  value={stage === "uploading" ? progress : 66}
                  className={`mt-2 h-2 ${stage === "extracting" ? "animate-pulse" : ""}`}
                />
              </div>
            </motion.div>
          )}

          {stage === "review" && syllabus && (
            <form className="form-stack" onSubmit={confirm}>
              <div className="notice info">
                Check that the text below matches your syllabus. Fix anything that was read
                incorrectly. PHACT only analyzes the text you confirm here.
              </div>
              <div className="field-row">
                <label>
                  Course title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
                <label>
                  <span>
                    Course code <span className="optional">(optional)</span>
                  </span>
                  <input
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    maxLength={40}
                    placeholder="e.g. EPI 501"
                  />
                </label>
              </div>

              <fieldset className="course-context product-course-context">
                <legend>Course context for AI recommendations</legend>
                <p className="hint">
                  These settings steer difficulty and tone. They stay with the syllabus, analysis,
                  and repository dump for this term.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="grade-level">Grade level</Label>
                  <Select
                    value={gradeLevel || undefined}
                    onValueChange={(v) => setGradeLevel(v as GradeLevel)}
                  >
                    <SelectTrigger id="grade-level" className="w-full h-11 product-select-trigger">
                      <SelectValue placeholder="Select level…" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <span className="field-label">Course focus</span>
                  <RadioGroup
                    value={courseFocus || undefined}
                    onValueChange={(v) => setCourseFocus(v as CourseFocus)}
                    className="product-focus-grid"
                    aria-label="Course focus"
                  >
                    {FOCUS_OPTIONS.map((o) => {
                      const Icon = o.icon;
                      const selected = courseFocus === o.value;
                      return (
                        <motion.label
                          key={o.value}
                          htmlFor={`focus-${o.value}`}
                          data-cursor="interactive"
                          className={cn("product-focus-card", selected && "is-selected")}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <RadioGroupItem
                            id={`focus-${o.value}`}
                            value={o.value}
                            className="mt-0.5"
                          />
                          <span className="product-focus-icon" aria-hidden="true">
                            <Icon />
                          </span>
                          <span className="product-focus-copy">
                            <strong>{o.label}</strong>
                            <small>{o.hint}</small>
                          </span>
                        </motion.label>
                      );
                    })}
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="term">Term</Label>
                  <Select
                    value={term || undefined}
                    onValueChange={(v) => setTerm(v as CourseTerm)}
                  >
                    <SelectTrigger id="term" className="w-full h-11 product-select-trigger">
                      <SelectValue placeholder="Select term…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TERM_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </fieldset>

              <label>
                Extracted syllabus text
                <textarea
                  className="syllabus-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={18}
                  required
                />
              </label>
              <p className="hint">
                {syllabus.file_name} · {wordCount.toLocaleString()} words
                {syllabus.page_count
                  ? ` · ${syllabus.page_count} page${syllabus.page_count === 1 ? "" : "s"}`
                  : ""}
              </p>
              <div className="actions">
                <Button type="submit" disabled={saving}>
                  <CheckCircle2 aria-hidden="true" />
                  {saving ? "Saving…" : "Confirm syllabus"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => remove(syllabus.syllabus_id, syllabus.title)}
                >
                  Discard
                </Button>
              </div>
            </form>
          )}

          {stage === "confirmed" && syllabus && (
            <div className="success-card">
              <CheckCircle2 className="success-icon" aria-hidden="true" />
              <h2>{syllabus.title}</h2>
              <p className="muted">
                {syllabus.course_code && `${syllabus.course_code} · `}
                {syllabus.word_count.toLocaleString()} words confirmed and ready for analysis.
              </p>
              <ul className="context-chips" aria-label="Course context">
                {syllabus.grade_level_label && <li>{syllabus.grade_level_label}</li>}
                {syllabus.course_focus_label && <li>{syllabus.course_focus_label}</li>}
                {syllabus.term_label && <li>{syllabus.term_label}</li>}
              </ul>
              <div className="actions center">
                <Button asChild>
                  <Link to={`/recommendations?syllabus=${syllabus.syllabus_id}&start=1`}>
                    <Sparkles aria-hidden="true" />
                    Generate AI recommendations
                  </Link>
                </Button>
                <Button type="button" variant="secondary" onClick={() => setStage("review")}>
                  Edit text
                </Button>
                <Button type="button" variant="secondary" onClick={startOver}>
                  Upload another
                </Button>
              </div>
            </div>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel">
            <h2 className="panel-title">How analysis works</h2>
            <ol className="steps-list">
              <li>
                <strong>Confirm your text</strong>
                <span>You check what PHACT read from your file.</span>
              </li>
              <li>
                <strong>Privacy screening</strong>
                <span>Names, emails, and phone numbers are removed before AI sees the text.</span>
              </li>
              <li>
                <strong>Grounded recommendations</strong>
                <span>Every suggestion cites approved ASPPH sources.</span>
              </li>
              <li>
                <strong>Competency mapping</strong>
                <span>Objectives are mapped to CEPH competencies.</span>
              </li>
              <li>
                <strong>Your approval</strong>
                <span>Nothing is exported or shared until you approve it.</span>
              </li>
            </ol>
          </section>
          <section className="panel guardrail-note">
            <h2 className="panel-title">
              <ShieldCheck aria-hidden="true" />
              Quality guardrails
            </h2>
            <p className="body-copy">
              Your syllabus stays private to your account. Recommendations are drafts that support
              your judgment; they never change your course without your approval.
            </p>
          </section>
        </aside>
      </div>

      <section className="panel">
        <h2 className="panel-title">My syllabi</h2>
        {list && list.length === 0 ? (
          <div className="empty">
            <p>Your uploaded syllabi will appear here.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Context</th>
                <th>File</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list?.map((item) => {
                const badge = STATUS_BADGES[item.status] ?? { label: item.status, tone: "neutral" };
                const context = [item.grade_level_label, item.course_focus_label, item.term_label]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={item.syllabus_id}>
                    <td>
                      <strong>{item.title}</strong>
                      {item.course_code && <small className="cell-sub">{item.course_code}</small>}
                    </td>
                    <td className="muted small">{context || "—"}</td>
                    <td className="muted">{item.file_name}</td>
                    <td>
                      <span className={`badge ${badge.tone}`}>{badge.label}</span>
                    </td>
                    <td className="muted">{formatDate(item.created_at)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link"
                        onClick={() => setSearchParams({ syllabus: item.syllabus_id })}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${item.title}`}
                        onClick={() => remove(item.syllabus_id, item.title)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </PageMotion>
  );
}
