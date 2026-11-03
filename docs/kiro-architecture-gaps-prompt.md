# Architecture review corrections

The review has been incorporated into the [consolidated Kiro spec prompt](kiro-spec-prompt.md). Use that prompt to create or update `.kiro/specs/phact-mvp/`; a separate gap-fixes prompt is no longer needed.

The consolidated version addresses all five review areas with these corrections:

1. **Output guardrails:** retain the documented input-only baseline while ASPPH resolves the reported conflict. Prepare an optional standalone output check with a separate guardrail configuration, preserved drafts, and explicit approval/export rules.
2. **Knowledge Base synchronization:** specify ingestion triggers, completion tracking, concurrent edits, and failures. Exclude retired sources from new model context immediately, then verify their removal from retrieval after synchronization.
3. **Failures and retries:** a browser timeout resumes the existing job. Only an eligible terminal failure starts a linked retry; duplicate delivery and repeated clicks must not duplicate completed work.
4. **Parallel agents:** run independent analyses concurrently, preserve successful partial results, show real progress, and define when a combined report is complete enough to approve/export.
5. **Private exports:** exports already appear in the diagram and original prompt. Strengthen private storage, exact approved-version generation, ownership checks, and signed downloads.

The claim about ASPPH user story US-8 remains a reported discrepancy to verify, not a confirmed requirement change. The consolidated prompt asks Kiro to identify existing coverage and unresolved decisions before implementation.
