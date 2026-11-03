# Kiro spec-driven development prompt

Use this consolidated prompt to create or revise the PHACT MVP spec. It includes the architecture review corrections; you do not need to run a separate gap-fix prompt.

1. Open this repository in Kiro on `sam_branch`.
2. Open the existing `phact-mvp` spec if present. Otherwise choose **Feature → Design-First → High Level Design** to create it.
3. Attach the [architecture diagram](architecture/phact-aws-architecture.png).
4. Copy everything under **Prompt** into the spec chat, ending before **References**.

The workflow follows [Kiro's Design-First guide](https://kiro.dev/docs/specs/feature-specs/tech-design-first/).

## Prompt

Help me create or update the PHACT Syllabridge MVP specification using Kiro's spec-driven development workflow.

Repository: https://github.com/Sadhvign/PHACT-Syllabridge-
Working branch: `sam_branch`
Spec directory: `.kiro/specs/phact-mvp/`

### Start with the existing project

Inspect the repository, README, architecture diagram, and any existing spec or implementation. Treat the diagram as a proposed architecture, not proof that services are implemented. Verify the checked-out branch before editing. Work only on `sam_branch`; do not push to or merge into `main` or `master`.

If `phact-mvp` exists, update it in place. Preserve unrelated work, stable requirement IDs, and completed-task history. Identify completed work that needs follow-up verification rather than silently marking it incomplete. If the spec is absent, create it using Design-First. Do not create a competing gap-fixes spec.

First report which requirements are already covered, which need changes, and which need a product decision, citing repository evidence. In particular, private exports already appear in the diagram and original prompt: strengthen their contract rather than describe them as a missing component.

### Product and scope

PHACT helps public-health faculty improve courses with AI. A teacher submits a syllabus, receives evidence-backed recommendations and a competency-gap table, reviews the results, and downloads an approved report. Keep the MVP focused on this complete workflow.

- Faculty manage their own syllabi, analyses, reviews, approvals, and exports.
- ASPPH administrators curate shared references and source inventory. Administrator status alone never grants access to another teacher's private files or results.
- Use public or clearly labelled synthetic demo data only.
- Student accounts, MyASPPH SSO, full teaching-material generation, forums, and an AI experimentation environment are outside this MVP.
- Community sharing is optional later work: approved content, explicit owner opt-in, separate storage, and a defined moderation policy. Export must never publish automatically.

Enforce roles and ownership on every protected server route. Derive ownership from the authenticated Cognito identity, never a browser-supplied owner ID. Keep private syllabi, drafts, and analyses out of the shared Knowledge Base. Audit review decisions and source changes without logging raw personal information.

### Architecture baseline

- React with TypeScript on AWS Amplify Hosting.
- Amazon Cognito with `faculty` and `aspph-admin` groups and pre-created demo users.
- Python 3.12, FastAPI and Mangum on AWS Lambda behind API Gateway with Cognito authentication.
- A background worker Lambda calling Strands agents hosted on Bedrock AgentCore.
- Amazon Bedrock models through configurable supported inference profiles.
- Approved references in S3, a Bedrock Knowledge Base, and S3 Vectors.
- DynamoDB for jobs, versioned results, approvals, and source inventory.
- Separate S3 locations for private uploads, shared knowledge, and private exports; reserve a separate community location for the optional feature.
- Amazon Comprehend for personal-information removal, followed by input Bedrock Guardrails. Output checks are an unresolved decision described below.
- Least-privilege IAM, KMS encryption, blocked public S3 access, CloudWatch, CloudTrail, and restricted model-invocation logs without raw personal information.
- AWS CDK in TypeScript targeting `us-east-1`, with configurable account and resource identifiers.

Validate service compatibility, permissions, quotas, and deployment assumptions against current official AWS documentation. Explain necessary deviations before changing the architecture; avoid unnecessary new infrastructure.

### End-to-end workflow

1. Faculty sign in, upload a PDF through an owner-authorized signed URL or paste syllabus text, then confirm extracted text.
2. The backend authorizes the request, removes personal information, and applies input content/topic checks before model processing. Keep raw content out of model calls and logs. Recheck changed input and any user-edited text sent to a model.
3. Create a background analysis job and promptly return its ID. Do not hold the API request open for AI analysis. Define the preprocessing/request boundary explicitly; show preprocessing progress in the submission UI if it occurs before the job exists.
4. Retrieve eligible references and run curriculum recommendations and competency mapping concurrently, subject to the contracts below.
5. Return specific course/module/assignment/objective improvements with source titles, identifiers, versions, and supporting excerpts. Separate retrieved evidence from AI suggestions. Never fabricate citations; explain insufficient evidence when necessary.
6. Return a course objective → matched competency → gap table using CEPH guidance and public or synthetic workforce expectations.
7. Save results as `DRAFT`. Faculty review evidence and suggestions, edit, approve, or reject their own result.
8. Permit DOCX/PDF export only when server-side ownership, exact-version approval, completeness, and any applicable safety conditions pass.

### 1. Resolve the output-guardrail decision explicitly

The supplied review claims that ASPPH user story US-8 and a demo path require output checks. The technical document and current diagram specify input-only checks and warn against attaching guardrails to Strands agent output. Verify the cited user story before treating that claim as an authoritative requirement. Record the conflict, evidence, decision owner, and acceptance impact in `design.md`.

Keep the input-only baseline while ASPPH's decision is pending. Do not silently enable output checks or call the conflict resolved. Prepare this optional design for approval:

- After generation, the worker evaluates final recommendation and competency text using standalone Bedrock `ApplyGuardrail` with `source=OUTPUT`.
- Use a separate, versioned guardrail configured for content filters without a PII policy. PII filtering is controlled by guardrail configuration, not an invented per-request switch. Input privacy checks remain mandatory.
- Do not attach the output guardrail directly to Strands. Store the original draft separately; an API intervention or block message must not overwrite the generated result.
- An authorized deployment configuration controls enablement and guardrail ID/version. Faculty cannot bypass the policy with a browser setting.
- Track safety independently from job execution and approval: for example `NOT_REQUIRED`, `PENDING`, `PASSED`, `FLAGGED`, or `CHECK_FAILED`. Record the evaluated result version and policy version. A failed check is never a pass.
- If adopted, default to blocking approval/export for pending, flagged, or failed checks until the agreed policy resolves them. Define who may inspect flagged drafts and resolve flags without granting administrators blanket access to private courses. Any override needs an explicit ASPPH decision and audit rule.
- Display a safe, understandable reason to the authorized reviewer. Re-evaluate edited final content before approval/export when this feature is enabled.

### 2. Make reference synchronization and retirement reliable

An admin-only API must handle source addition, update, and retirement. Track source type, owner, date, governance status, and version separately from synchronization status.

- Persist the source change and update/remove its S3 content and metadata. Start or schedule a Bedrock `StartIngestionJob` for the affected data source without blocking the admin request.
- Track the ingestion job ID and actual completion through `GetIngestionJob`, including timestamps, failure details safe for display, and affected source versions. An accepted request is not a completed sync.
- Show `PENDING`, `SYNCING`, `SYNCED`, or `FAILED`. Handle concurrent edits, conflicts, throttling, and retries with idempotency and a durable record of pending changes. Specify how the next sync starts; do not leave this as an unspecified future mechanism.
- An ingestion run covers a data source, so do not label a newer source revision synced merely because an older run finished. Handle document-level failures as well as overall job status.
- Immediately exclude retired or superseded versions from new model context and citations by checking retrieved source IDs/versions against the authoritative inventory. Do not wait for eventual index synchronization to enforce eligibility.
- After successful synchronization, verify that retired source chunks no longer appear in raw retrieval. Preserve historical source/version attribution in existing reports; do not silently rewrite them.

### 3. Separate failure, retry, and browser waiting

Define job states such as `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIALLY_SUCCEEDED`, and `FAILED`. Keep these separate from result review states (`DRAFT`, `APPROVED`, `REJECTED`) and optional output-safety states.

- Store owner, attempt ID, timestamps, server deadline, progress, and user-safe error codes/messages. Do not expose raw stack traces or personal information.
- Poll with backoff, stop on terminal states, and allow a page reload to resume the same authorized job ID.
- A browser waiting limit or network failure does not mean the worker failed. Show “still processing” or “could not check progress” and offer refresh/resume. Never automatically create another analysis on a polling timeout.
- Offer “Try again” for retryable failures in terminal `FAILED` jobs or failed components of terminal `PARTIALLY_SUCCEEDED` jobs. Create a linked new attempt (`retryOf`) using the same owner-authorized retained scrubbed input, without requiring re-upload. Define retention, expiry handling, bounded retries, and repeat-click protection. Revalidate input if it changes or applicable policy changes.
- Input-policy blocks and access denials must not be retried unchanged. Distinguish retryable infrastructure errors from user-correctable errors.
- Lambda asynchronous delivery can repeat events. Specify conditional job claims and idempotent result writes so duplicates cannot overwrite results or repeat completed work.
- Define how abandoned jobs reach a terminal state when a worker crashes or exceeds its server deadline; do not rely solely on worker cleanup code that may never run.

### 4. Run independent agents concurrently and preserve partial results

Confirm that the curriculum and competency agents can each consume the confirmed scrubbed input and eligible references without depending on each other's output. Define separate inputs, outputs, deadlines, statuses, and errors.

Run both concurrently with bounded concurrency and timeouts. Persist each successful result independently. A sibling failure must not discard successful work. Both successful means `SUCCEEDED`; one successful means `PARTIALLY_SUCCEEDED`; neither successful means `FAILED`.

Show which part succeeded or failed. Partial results remain viewable as drafts; require both parts before approving/exporting the combined report unless ASPPH explicitly approves a clearly labelled partial-report policy. Specify whether a retry reruns both agents or only the failed part, including result-version provenance.

Display observable progress such as retrieving sources, writing recommendations, and mapping competencies. Parallel activities may overlap; do not fabricate a sequential percentage. Target approximately 60 seconds and measure deployed latency under stated demo conditions, including retrieval and any enabled safety checks. Concurrency alone does not prove the target is met.

### 5. Enforce private exports of the approved version

Use a private KMS-encrypted exports location with blocked public access and least-privilege access. Generate owner-scoped object keys on the server; never trust a browser-supplied owner ID or storage key.

Record each export's owner, result ID, immutable approved revision, reviewer, approval timestamp, format, and object key. Generate from that exact revision, preserving citations. Editing approved content creates a new draft revision requiring fresh approval and any applicable safety checks.

Authorize both export creation and download-link issuance. Use short-lived signed download URLs, with a documented configurable lifetime. These are bearer links: possession permits access while valid, without another Cognito ownership check at S3. Document expiry and revocation limits. Keep exports out of shared knowledge and community storage.

### Specification deliverables and verification

Create or update these files under `.kiro/specs/phact-mvp/`:

- `design.md`: component and sequence diagrams, API contracts, data models, role/ownership checks, job/agent/review/safety states, source synchronization, retries and deadlines, exports, deployment, and open decisions.
- `requirements.md`: stable numbered user stories with testable EARS acceptance criteria, including failure and denied-access cases.
- `tasks.md`: small implementation tasks with dependencies, requirement references, and concrete verification steps. Label optional work and decision-blocked tasks explicitly.

Organize milestones around foundation/sign-in; private input/jobs; grounded parallel analysis; review/export; admin source management; and the complete demo.

Include meaningful checks for:

- Cross-user denial for uploads, job polling, results, retry, approval, and export; faculty denial on admin routes; no automatic admin access to private files.
- Personal-information removal before model calls, input-policy blocks, safe logs, evidence attribution, and insufficient-evidence responses.
- Output checks enabled/disabled if adopted, interventions, service failures, edited revisions, preserved drafts, and blocked approval/export when required checks are unresolved.
- Admin add/update/retire, ingestion completion/failure/concurrent changes, immediate exclusion of retired versions from model context, and their removal from raw retrieval after sync.
- Duplicate worker delivery and repeated retry clicks; browser timeout/reload resuming one job; terminal failures, deadline expiry, and authorized retries using retained scrubbed input.
- Overlapping agent execution, one or both agents failing, successful sibling preservation, honest progress, partial-result restrictions, and measured end-to-end latency.
- DOCX and PDF content/citations matching the approved revision, export of an edited draft being blocked until reapproval, private storage, signed-link expiry, rejected cross-user download-link requests, and rejected unsigned storage access.

Clearly distinguish local mock checks from verification against deployed AWS services. Never mark an AWS integration verified solely because mocks pass.

Start by inspecting the repository and presenting the coverage summary and proposed `design.md` changes for review. List assumptions and unresolved ASPPH decisions separately. After I approve the design, continue to requirements, then tasks. Begin application implementation only after the updated spec is reviewed.

## References

- [Architecture diagram](architecture/phact-aws-architecture.png)
- [ASPPH vision document](https://github.com/12turnbullb/us-breaking-barriers-2026/blob/master/ASPPH/Vision%20Document_ASPPH_PHACT%20%28MVP%29.md)
- [ASPPH technical document](https://github.com/12turnbullb/us-breaking-barriers-2026/blob/master/ASPPH/Technical%20Document_ASPPH_PHACT%20%28MVP%29.md)
- [Kiro Design-First workflow](https://kiro.dev/docs/specs/feature-specs/tech-design-first/)
- [Bedrock standalone guardrail evaluation](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html)
- [ApplyGuardrail request and response](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html)
- [StartIngestionJob](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_StartIngestionJob.html) and [GetIngestionJob](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_GetIngestionJob.html)
- [Lambda asynchronous retries and duplicate events](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html)
- [S3 presigned URL access and expiry](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
