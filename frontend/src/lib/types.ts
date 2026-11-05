export type University = {
  id: string;
  name: string;
  domain: string;
  region: string;
  city?: string;
  state?: string;
  zip_code?: string;
  prefix?: string;
  institution_types?: string[];
  institution_type_labels?: string[];
  guardrails_enabled?: boolean;
  custom?: boolean;
  demo_email?: string;
};

export type Profile = {
  user_id: string;
  email: string;
  display_name: string;
  given_name: string;
  institution: string;
  university: University;
  groups: string[];
  is_admin: boolean;
};

export type DashboardData = {
  stats: {
    syllabi_uploaded: number;
    syllabi_this_month: number;
    competencies_mapped: number;
    analyses_completed: number;
    actions_this_week: number;
    pending_reviews: number;
  };
  recent_uploads: {
    syllabus_id: string;
    title: string;
    uploaded_at: string;
    status: string;
  }[];
  saved_recommendations: {
    analysis_id: string;
    title: string;
    saved_at: string;
    review_status: string;
  }[];
};

export type SyllabusStatus = "EXTRACTED" | "EXTRACTION_FAILED" | "CONFIRMED";

export type GradeLevel = "BACHELORS" | "MASTERS" | "PHD" | "DOCTORATE";
export type CourseFocus = "INDUSTRY" | "RESEARCH" | "BALANCED";
export type CourseTerm = "FALL_2027" | "SPRING_2027" | "SUMMER_2027";

export type SyllabusSummary = {
  syllabus_id: string;
  title: string;
  course_code: string;
  grade_level?: string;
  course_focus?: string;
  term?: string;
  grade_level_label?: string;
  course_focus_label?: string;
  term_label?: string;
  file_name: string;
  status: SyllabusStatus;
  word_count: number;
  created_at: string;
  updated_at: string;
};

export type SyllabusDetail = SyllabusSummary & {
  page_count: number | null;
  text: string;
  message: string;
};

export type UploadTicket = {
  syllabus_id: string;
  upload_url: string;
  content_type: string;
};

export type KnowledgeSource = {
  source_id: string;
  title: string;
  source_type: string;
  owner: string;
  effective_date: string;
  governance_status: "ACTIVE" | "RETIRED";
  version: number;
  file_name: string;
  sync_status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  synced_version: number | null;
  sync_message: string;
  last_sync_at: string;
  removal_verified: boolean | null;
  updated_at: string;
};

export type SourceInventory = {
  sources: KnowledgeSource[];
  sync: {
    active_job_id: string;
    last_job_id: string;
    last_job_status: string;
    last_finished_at: string;
    last_start_error: string;
  };
};

export type PartName = "recommendations" | "competencies";
export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED";
export type ReviewStatus = "DRAFT" | "APPROVED" | "REJECTED" | "";

export type PartView = {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  stage: string;
  error_code: string;
  message: string;
  retryable: boolean;
  count: number;
};

export type RevisionMeta = {
  revision: number;
  base_revision: number;
  origin: string;
  complete: boolean;
  parts: PartName[];
  review_status: ReviewStatus;
  safety_status: string;
  reviewer_name: string;
  reviewed_at: string;
  review_comment: string;
  created_at: string;
};

export type Analysis = {
  analysis_id: string;
  syllabus_id: string;
  course_title: string;
  course_code: string;
  grade_level?: string;
  course_focus?: string;
  term?: string;
  grade_level_label?: string;
  course_focus_label?: string;
  term_label?: string;
  job_status: JobStatus;
  attempt: number;
  max_attempts: number;
  parts: Record<PartName, PartView>;
  can_retry: boolean;
  can_regenerate?: boolean;
  refine_count?: number;
  max_refines?: number;
  faculty_feedback?: string;
  redactions: Record<string, number>;
  truncated: boolean;
  input_policy_version: string;
  latest_revision: number;
  approved_revision: number;
  review_status: ReviewStatus;
  recommendation_count: number;
  competency_count: number;
  created_at: string;
  started_at: string;
  finished_at: string;
  deadline_at: string;
  revisions?: RevisionMeta[];
};

export type Evidence = {
  ref: string;
  source_id: string;
  version: number;
  title: string;
  source_type: string;
  excerpt: string;
};

export type EvidenceStatus = "SUPPORTED" | "INSUFFICIENT_EVIDENCE";

export type AssignmentPreview = {
  title: string;
  student_prompt: string;
  deliverable: string;
  ai_policy: string;
};

export type Recommendation = {
  id: string;
  category: "TEACHING_METHODS" | "ASSESSMENT" | "CONTENT_ENHANCEMENT";
  target_type: string;
  target: string;
  title: string;
  /** Exact short syllabus text shown in the faculty PDF at the target. */
  proposed_change?: string;
  recommendation: string;
  /** CourseWork Description tab: what it covers, how it differs, current AI/tech added. */
  coursework_description?: string;
  rationale: string;
  implementation_steps: string[];
  assignment?: AssignmentPreview;
  approach: "INTEGRATE_AI" | "AI_RESISTANT";
  citations: string[];
  evidence_status: EvidenceStatus;
  excluded?: boolean;
};

export type Coverage = "STRONG" | "PARTIAL" | "GAP";

export type ObjectiveMapping = {
  id: string;
  objective: string;
  matches: string[];
  coverage: Coverage;
  gap_notes: string;
  citations: string[];
  evidence_status: EvidenceStatus;
  excluded?: boolean;
};

export type RevisionContent = {
  recommendations?: {
    course_summary: string;
    recommendations: Recommendation[];
    evidence_gaps: string[];
    evidence: Evidence[];
  };
  competencies?: {
    objectives: ObjectiveMapping[];
    workforce_expectations: {
      id: string;
      expectation: string;
      course_alignment: string;
      citations: string[];
      evidence_status: EvidenceStatus;
    }[];
    uncovered_competencies: {
      id: string;
      competency: string;
      suggestion: string;
      citations: string[];
      evidence_status: EvidenceStatus;
    }[];
    evidence: Evidence[];
  };
};

export type Revision = RevisionMeta & { content: RevisionContent };

export type ChangeCounts = { total: number; kept: number; edited: number; excluded: number };

export type ProvenanceStats = {
  recommendations: ChangeCounts;
  objectives: ChangeCounts;
  ai_text_retained_percent: number;
  faculty_changed_percent: number;
};

export type ItemChange = {
  kind: "recommendations" | "objectives";
  id: string;
  title: string;
  status: "EDITED" | "EXCLUDED";
  fields: string[];
};

type ReportSnapshot = {
  analysis_id: string;
  revision: number;
  course_title: string;
  course_code: string;
  owner_name: string;
  university_id: string;
  university_name: string;
  approved_at: string;
  stats: ProvenanceStats;
  changes: ItemChange[];
  recommendation_count: number;
  objective_count: number;
  created_at: string;
  term?: string;
  term_label?: string;
  grade_level?: string;
  course_focus?: string;
};

export type Share = ReportSnapshot & {
  share_id: string;
  kind: "LINK" | "EMAIL";
  permission: "VIEW";
  message?: string;
  pdf_url?: string;
  download_url?: string;
};

export type EmailShareResult = {
  shared: boolean;
  recipients: { email: string; error: string; shared: boolean }[];
};

export type SubmissionStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type Submission = ReportSnapshot & {
  submission_id: string;
  status: SubmissionStatus;
  faculty_note?: string;
  admin_note?: string;
  decided_by?: string;
  decided_at?: string;
  pdf_url?: string;
  download_url?: string;
  repository_url?: string;
  repository_pdf_key?: string;
};

export type Feedback = {
  experience_rating: number;
  usefulness_rating: number;
  comment: string;
  updated_at: string;
};

export type UniversityStats = University & {
  submissions: number;
  PENDING: number;
  ACCEPTED: number;
  DECLINED: number;
  shares: number;
  last_submission_at: string;
  avg_ai_retained_percent: number | null;
  avg_faculty_changed_percent: number | null;
  avg_experience: number | null;
  avg_usefulness: number | null;
  feedback_count: number;
};

export type Analytics = {
  totals: {
    submissions: number;
    pending: number;
    accepted: number;
    declined: number;
    acceptance_rate: number | null;
    shares: number;
    feedback: number;
    avg_experience: number | null;
    avg_usefulness: number | null;
    avg_ai_retained_percent: number | null;
    universities_active: number;
  };
  items: { kept?: number; edited?: number; excluded?: number };
  universities: UniversityStats[];
  by_month: { month: string; pending: number; accepted: number; declined: number }[];
  recent: Submission[];
};

export type ExportItem = {
  export_id: string;
  format: "DOCX" | "PDF";
  revision: number;
  file_name: string;
  size_bytes: number;
  reviewer_name: string;
  approved_at: string;
  created_at: string;
};
