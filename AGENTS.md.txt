# AGENTS.md --- AlertNet Agent Operating Rules

**Project:** AlertNet --- PS05 Flood Response & Citizen SOS Platform\
**Contract:** `docs/ALERTNET_CONTEXT_v2.1.md`\
**Execution budget:** 6 hours\
**Purpose:** Persistent instructions for every coding agent working in
this repository.

------------------------------------------------------------------------

## 1. Read the contract first

Before changing files:

1.  Inspect the repository structure and existing implementation.
2.  Read `docs/ALERTNET_CONTEXT_v2.1.md` completely.
3.  Identify the current phase, existing code, working commands and
    known failures.
4.  Do not recreate or overwrite existing work without checking it
    first.
5.  Treat the project contract as the source of truth for architecture,
    API/event contracts, data invariants and acceptance tests.

If the contract file is missing, stop and ask for it. Do not invent a
replacement contract.

## 2. Core engineering priorities

Work in this order:

1.  Correctness and data durability.
2.  End-to-end functionality.
3.  Recovery and idempotency.
4.  Integration and test evidence.
5.  Usability.
6.  Visual polish.

A small working vertical slice is better than many incomplete modules.

Never weaken a reliability invariant just to make a demo appear
successful.

### Non-negotiable invariants

-   A citizen SOS is acknowledged only after its PostgreSQL transaction
    commits.
-   SOS acceptance must not wait for RabbitMQ; use the transactional
    outbox defined in the contract.
-   PostgreSQL is authoritative for SOS, incident, assignment,
    alert-batch and delivery state.
-   RabbitMQ consumers use manual acknowledgements and acknowledge only
    after durable work completes.
-   Consumers and retries must be idempotent.
-   Redis is an optimisation, never the sole protection for a critical
    business invariant.
-   Team assignment must be protected by PostgreSQL
    transactions/constraints, not only a Redis lock.
-   Alert batches and recipient membership must be durable before
    publication.
-   Each alert channel must fail and recover independently.
-   AI must not delete, reject or silently close citizen reports.
-   Preserve original citizen input and human override audit history.
-   UI states must reflect persisted facts. Never show a message as
    sent, a team as assigned or help as dispatched unless that state is
    confirmed.

## 3. Work phase by phase --- do not build everything at once

Follow the six-hour plan in the project contract. Work in small,
reviewable phases:

1.  Repository, contracts and startup foundation.
2.  SOS acceptance, idempotency and outbox.
3.  Triage, incident grouping, map and assignment.
4.  Durable alert fan-out and independent channel workers.
5.  Load tests, metrics and failure drills.
6.  Freeze, fix showstoppers and prepare the demo.

At the start of a phase: - State the phase objective in one or two
sentences. - List the files/modules expected to change. - Identify
dependencies and the acceptance test. - Implement only that phase unless
a small prerequisite fix is essential.

At the end of a phase: - Run the relevant tests. - Summarise changed
files and actual test results. - List remaining blockers and the next
smallest step. - Stop for checkpoint review when requested by the user.

Do not silently jump ahead or implement unrelated features.

## 4. Do not get stuck --- bounded problem-solving rules

Do not loop endlessly on one error, dependency, tool or implementation
approach.

When blocked:

1.  Reproduce the problem and capture the exact error.
2.  Check the most likely cause and inspect relevant code/configuration.
3.  Try at most **two focused fixes** for the same root cause.
4.  If still blocked, spend no more than **10 minutes of the available
    hackathon time** on that issue before switching to a safe fallback.
5.  Record the blocker, what was tried, the evidence and the recommended
    next action.
6.  Continue with independent work that does not depend on the blocker.

Use this fallback order: - Prefer an existing installed dependency over
adding a new one. - Prefer a simple local implementation over
introducing a new service. - Prefer deterministic rules/fallback
behaviour over a fragile AI dependency. - Prefer a simulated gateway
over waiting for real third-party credentials. - Prefer a smaller
complete feature over a partially implemented advanced feature.

Do not: - Repeat the same command without changing the cause. -
Reinstall or upgrade the whole toolchain as a first response. - rewrite
large files to fix a small bug. - keep changing architecture to avoid
diagnosing a local defect. - claim a blocker is solved without rerunning
the failing test.

If blocked by missing credentials, network access, unavailable services
or unsupported tooling, state that clearly and use a local
mock/simulator where the contract allows it.

## 5. Be concise and token-efficient

Communicate precisely. Avoid long explanations, repeated context,
generic advice and unnecessary narration.

Default response format:

**Status:** Done / Partial / Blocked\
**Changed:** concise file list\
**Tests:** exact commands and pass/fail results\
**Risks:** only current material risks\
**Next:** one concrete next action

Rules: - Give the answer first. - Use short bullets and specific
filenames. - Do not repeat the project brief or this file in every
response. - Do not print entire files or large logs unless requested. -
Show only relevant error excerpts; preserve full logs in files when
useful. - Do not explain routine tool operations. - Ask a question only
when a decision is genuinely required to proceed. - If a reasonable,
reversible default exists, use it and state the assumption briefly. - Do
not produce multiple alternative architectures unless asked. - Keep
plans proportional to the task.

## 6. Contract and integration discipline

Before changing a shared contract, inspect all consumers and tests.

Do not independently rename or redefine: - API routes or
request/response fields. - Database tables, columns, constraints or
migration order. - RabbitMQ exchanges, queues, routing keys or event
names. - Redis key conventions. - Status enums or state transitions.

If a contract change is necessary: 1. Explain the reason briefly. 2.
Identify all affected modules. 3. Update the contract and implementation
consistently. 4. Add/update tests. 5. Report the change for user
approval when it affects cross-agent integration or a non-negotiable
invariant.

Use one shared schema and event definition. Do not create competing
versions in separate modules.

## 7. Coding and repository safety

-   Inspect before editing; preserve existing working code.
-   Make small, focused changes.
-   Follow the repository's existing style and naming conventions.
-   Keep secrets, tokens and real personal data out of source control.
-   Use synthetic data for demos and load tests.
-   Validate and bound external input.
-   Add database migrations; do not rely on undocumented manual schema
    changes.
-   Never delete user data, migrations or working modules without
    explicit approval.
-   Do not run destructive commands or reset the repository without
    approval.
-   Do not add dependencies unless needed; explain any new dependency
    briefly.
-   Keep configuration in environment variables and provide a safe
    `.env.example`.
-   Ensure startup instructions work from a clean checkout as far as the
    environment permits.

## 8. Testing and evidence

Never claim success based only on code inspection.

For each meaningful change: 1. Run the narrowest relevant test. 2. Run
integration tests for affected boundaries. 3. Run the full test suite
when practical. 4. Report exact commands and actual results. 5. If a
test cannot run, state why; do not mark it as passed.

Prioritise these project tests: - Repeated SOS submission with the same
idempotency key creates one report. - RabbitMQ outage does not prevent a
committed SOS from being accepted. - Pending outbox events publish after
RabbitMQ recovery. - A crash after triage but before incident
association does not strand the report. - Concurrent assignment requests
cannot assign one team twice. - Alert fan-out resumes after worker
restart. - Duplicate delivery attempts do not create duplicate delivery
effects. - Failure of one alert channel does not stop the other
channels. - Failed-channel work recovers after the channel returns. -
Redis interruption does not violate PostgreSQL-backed invariants. - One
API instance can stop while the other continues.

Use deterministic test data and fixed random seeds where possible.

## 9. AI and external services

-   SOS acceptance must never depend on an LLM or remote model.
-   Keep deterministic triage fallback available.
-   AI outputs must be validated before persistence.
-   Preserve model version, confidence and explanation where specified
    by the contract.
-   Do not fabricate F1 scores or claim the target is met without
    held-out evaluation.
-   Use simulated SMS, push and email gateways unless real credentials
    and explicit approval are provided.
-   Do not send real messages or contact real residents during
    development/testing.

## 10. Multi-agent coordination

When multiple agents work in parallel:

-   Respect the ownership/workstream assignments in the project
    contract.
-   Do not edit another agent's files or shared migrations without
    coordination.
-   Agree shared interfaces before parallel implementation.
-   Keep commits and changes small.
-   Notify the integrator of changed contracts immediately.
-   Resolve merge conflicts deliberately; never discard another agent's
    work just to make a merge pass.
-   Integrate continuously; do not wait until the final hour.
-   Maintain a known-good runnable checkpoint.

## 11. Time management and scope control

The confirmed working plan is six hours. Treat time as a hard
constraint.

-   Keep the application runnable from the earliest possible phase.
-   Integrate after every vertical slice.
-   Reserve the final 20 minutes for freeze, showstopper fixes and demo
    rehearsal.
-   If behind schedule, reduce UI polish and optional features first.
-   Do not remove durability, idempotency, database constraints, channel
    isolation or core failure tests to save time.
-   Do not start a new advanced feature when a P0 path is broken.
-   Report schedule risk early, with a concrete scope reduction
    proposal.

The uploaded challenge brief states four hours, while the team has
confirmed a six-hour working window. If organisers enforce four hours,
follow the compressed fallback in the project contract.

## 12. Completion and handoff report

At the end of each phase, report:

-   **Phase/objective**
-   **Status:** Done / Partial / Blocked
-   **Files changed**
-   **API/schema/event changes**
-   **Commands executed**
-   **Tests passed/failed/not run**
-   **Failure scenarios tested**
-   **Known issues**
-   **Exact startup command**
-   **Next recommended action**

Be truthful. Distinguish implemented, tested, partially tested and
unverified.

## 13. Final instruction

Build AlertNet as a reliable, demonstrable emergency-response
workflow---not as a collection of disconnected screens or technologies.

Read and follow `docs/ALERTNET_CONTEXT_v2.1.md`. Do not generate a giant
one-shot implementation, do not get stuck repeating failed approaches,
and do not waste tokens on verbose status messages.

**The user controls phase progression and final scope approval. Do not
generate or execute a separate master prompt unless explicitly
requested.**