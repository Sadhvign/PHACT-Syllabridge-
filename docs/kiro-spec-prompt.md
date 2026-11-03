# Kiro spec-driven development prompt

Use this prompt to start the PHACT MVP specification in Kiro.

1. Open this repository in Kiro and select `sam_branch`.
2. Create a new spec using **Feature → Design-First → High Level Design**.
3. Attach the [architecture diagram](architecture/phact-aws-architecture.png).
4. Copy the prompt below into the spec chat.

The workflow is described in [Kiro's Design-First guide](https://kiro.dev/docs/specs/feature-specs/tech-design-first/).

## Prompt

Help me build PHACT Syllabridge using Kiro’s spec-driven development workflow.

Repository: https://github.com/Sadhvign/PHACT-Syllabridge-
Working branch: sam_branch

First inspect the repository, README, and attached architecture diagram. Treat the diagram as the proposed architecture, not evidence that the application already exists. Work on sam_branch and preserve existing files. Do not push to or merge into main or master.

Create a Feature Spec named phact-mvp using the Design-First workflow. Start with the specification before implementing application code.

The product helps public-health faculty improve their courses by identifying useful ways to incorporate AI. A teacher submits a syllabus, receives recommendations backed by approved references, checks which required skills the course covers or misses, reviews the results, and downloads an approved report.

Keep the first version focused on one complete, demonstrable workflow.

Use these two roles:

- Faculty: submit their own syllabi, run analysis, inspect sources and skills gaps, edit results, approve or reject them, and download approved reports.
- ASPPH administrator: manage the approved reference library and source inventory. Administrator status must not automatically provide access to another teacher’s private files or results.

Use the architecture shown in the diagram:

- Frontend: React with TypeScript, hosted on AWS Amplify.
- Authentication: Amazon Cognito with faculty and aspph-admin groups and pre-created demo users.
- Backend: Python 3.12, FastAPI and Mangum on Lambda behind API Gateway.
- Background processing: worker Lambda calling Strands agents hosted on Bedrock AgentCore.
- AI: Amazon Bedrock models using configurable, supported inference profiles.
- References: approved documents in S3, a Bedrock Knowledge Base, and S3 Vectors.
- Persistence: DynamoDB for jobs, results, approval records, and source inventory.
- Storage: separate S3 locations for private uploads, shared references, and private exports.
- Privacy: Amazon Comprehend followed by input-only Bedrock Guardrails.
- Operations: KMS encryption, CloudWatch, CloudTrail, and restricted model-invocation logs.
- Infrastructure: AWS CDK in TypeScript, targeting us-east-1 with configurable account and resource identifiers.

Specify this workflow:

1. A faculty member signs in and uploads a PDF syllabus or pastes its text.
2. The application extracts the text and lets the teacher confirm it.
3. The backend checks permissions, removes personal information, and applies input content/topic checks before model processing.
4. The API creates a background job, promptly returns a job ID, and lets the frontend poll for progress.
5. The agents retrieve approved references and generate specific recommendations for course modules, assignments, or objectives.
6. Every recommendation includes a supporting source title and excerpt. Clearly distinguish source evidence from AI-generated suggestions.
7. The analysis also returns a course objective → matched competency → gap table, using CEPH guidance and sample workforce expectations.
8. Results are saved as Draft. The teacher can edit, approve, or reject them.
9. The server allows DOCX/PDF export only for an approved result owned by that teacher. Preserve citations and provide a private download.

Include these rules in the design and acceptance criteria:

- Enforce roles and ownership on the server, including uploads, job polling, results, and exports.
- Derive ownership from the authenticated user; do not trust an owner ID supplied by the browser.
- Keep private syllabi out of the shared knowledge base.
- Prevent raw personal information from reaching models or application/model logs.
- Run AI analysis asynchronously; do not hold the original API request open.
- Never invent citations. Show an honest insufficient-evidence response when retrieval cannot support a recommendation.
- Record the reviewer and approval timestamp. Approval must apply to the exact version being exported.
- Track source type, owner, date, and status. Retired sources must be excluded from new retrieval results.
- Use only public or clearly labelled synthetic demo data.
- Target analysis completion in approximately 60 seconds, with clear progress and failure states.
- Use least-privilege permissions, encryption, and blocked public S3 access.

Create the spec documents under .kiro/specs/phact-mvp/:

- design.md: components, architecture and sequence diagrams, API contracts, data models, authorization rules, job and approval states, error handling, deployment approach, and testing strategy.
- requirements.md: numbered user stories and testable acceptance criteria using EARS notation.
- tasks.md: small implementation tasks with dependencies, requirement references, and verification steps.

Organize the build into manageable milestones: foundation and sign-in; private input and background jobs; grounded AI analysis; review and export; administrator source management; and a complete demo.

Include meaningful checks for cross-user access denial, administrator restrictions, personal-information removal, citations, retired sources, failed jobs, and blocked export of unapproved results. Clearly distinguish local mock testing from verification against deployed AWS services.

Student accounts, MyASPPH single sign-on, full teaching-material generation, discussion forums, and an AI experimentation environment are outside this MVP. Community sharing is an optional later task.

Start now by inspecting the project and producing design.md for review. Identify important assumptions or conflicts rather than silently changing the architecture. After I approve the design, continue to requirements, then tasks. Begin implementation after the spec is reviewed.
