# Kiro spec-driven development prompt: architecture gap fixes

Use this prompt to add the five gaps found in the PHACT architecture review to the PHACT MVP specification in Kiro.

1. Open this repository in Kiro and select `sam_branch`.
2. Open the existing **phact-mvp** spec (`.kiro/specs/phact-mvp/`). If it doesn't exist yet, run the main PHACT MVP prompt first.
3. Attach the [architecture diagram](architecture/phact-aws-architecture.png).
4. Copy the prompt below into the spec chat.

The workflow is described in [Kiro's Design-First guide](https://kiro.dev/docs/specs/feature-specs/tech-design-first/).

## Prompt

Help me update the PHACT Syllabridge spec to close five gaps found in an architecture review.

Repository: https://github.com/Sadhvign/PHACT-Syllabridge-
Working branch: sam_branch

First inspect the repository, README, the attached architecture diagram, and the existing spec under .kiro/specs/phact-mvp/ (design.md, requirements.md, tasks.md). Work on sam_branch and preserve existing files. Do not push to or merge into main or master. Do not start a new spec: update phact-mvp in place, and change only what these five gaps require.

For each gap below, check whether phact-mvp already covers it. If it does, say so and leave it alone. If it doesn't, add it to design.md, add or adjust requirements in requirements.md using EARS notation, and add tasks to tasks.md with dependencies, requirement references, and verification steps. Keep the architecture shown in the diagram; these are additions, not redesigns.

Gap 1: Output guardrails (needs a decision from ASPPH).

- The ASPPH user stories (US-8) ask for guardrails on input and output, and the demo path lists "Competency Mapping → Guardrails". The ASPPH technical document says not to attach the Bedrock Guardrail to agent output, because the guardrail's PII layer false-positives and any output intervention makes Strands replace the whole response with the block message. The current diagram follows the technical document: input checks only.
- Record this as an open decision in design.md. Do not silently pick one.
- Specify the optional design so it's ready if ASPPH wants output checks: after the agents finish, the worker Lambda calls Bedrock's standalone ApplyGuardrail API on the final recommendation and competency text, using content filters only (no PII layer). If the guardrail intervenes, the job keeps its results, is marked for review with a clear flag, and the faculty review screen shows why. Results are never replaced with a block message.
- Make the output check configurable (on/off) so it can be switched without code changes.

Gap 2: Knowledge Base sync trigger.

- The diagram shows admin curate → approved sources in S3 → ingest → Knowledge Base, but not who starts ingestion.
- Specify that an administrator action (adding, updating, or retiring a source) starts a Knowledge Base ingestion job (StartIngestionJob) through an admin-only API route, and that the source inventory shows the sync status (for example: syncing, synced, failed) with a timestamp.
- Retired sources must be excluded from new retrieval results after the sync completes. Include a check that retrieval no longer returns a retired source.

Gap 3: Failure path.

- The worker updates job status and errors, but the diagram doesn't show what the faculty member sees when a job fails.
- Specify job states (for example: QUEUED, RUNNING, SUCCEEDED, FAILED) and a stored, user-safe error reason with no raw stack traces or personal information.
- When a job fails, the React app shows a friendly message and a "Try again" action that starts a new job from the same confirmed, scrubbed input without re-uploading.
- When polling exceeds a reasonable time limit, show a timeout message with the same "Try again" option.

Gap 4: Parallel agents.

- The curriculum and competency agents don't depend on each other, and running them one after the other makes the ~60-second target harder to hit.
- Specify that the worker runs both agents in parallel and waits for both. If one agent fails, keep the other's results, mark the job as partially complete, and tell the faculty member which part failed.
- Add the progress steps the frontend shows while polling (for example: removing personal information, searching ASPPH sources, writing recommendations, mapping competencies).

Gap 5: Exports bucket.

- The ASPPH technical document lists four separate S3 locations: knowledge, uploads, community, and exports. The diagram shows uploads and approved sources but not where exported files go.
- Specify a private, KMS-encrypted exports location with blocked public access, owner-scoped object keys, and short-lived signed download URLs.
- Exports must never be written to the shared knowledge location, and the export record must link to the exact approved version it was generated from.

Include meaningful checks for: the output guardrail on and off (if adopted); retired sources disappearing from retrieval after sync; a failed job showing the friendly message and a working "Try again"; one agent failing while the other's results are kept; both agents running in parallel within the time target; and an export landing only in the private exports location with a working signed link. Clearly distinguish local mock testing from verification against deployed AWS services.

Start now by inspecting the project and producing a short summary of which gaps phact-mvp already covers and which it doesn't. Then propose the design.md changes for review. Identify important assumptions or conflicts rather than silently changing the architecture. After I approve the design changes, update requirements, then tasks. Do not implement code until the updated spec is reviewed.
