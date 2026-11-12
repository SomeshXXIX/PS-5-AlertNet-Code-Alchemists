# AlertNet â€” Shared Project Context & Build Contract
## Version 2.1 â€” Reliability corrections and 6-hour execution plan

**Project:** PS05 / S05 â€” AlertNet: Flood Response & Citizen SOS Platform  
**Status:** Proposed implementation contract for team approval  
**Execution window used by this plan:** 6 hours  
**Team size:** 4  
**Important duration note:** The uploaded challenge brief states 4 hours. The team has subsequently confirmed a 6-hour working window. This document preserves the brief's original statement while planning execution for 6 hours. If the organisers enforce a 4-hour limit, use the compressed fallback schedule in Section 21.

---

## 0. Purpose and authority

This document is the shared source of truth for implementation decisions, module boundaries, event contracts, reliability invariants, acceptance tests and the team's six-hour execution plan.

The uploaded challenge brief is authoritative for problem scope and judging targets. The uploaded PS5-vs-PS4 analysis is background rationale for choosing AlertNet; it is not an additional requirement source. Engineering details in this document are implementation decisions proposed for the team to approve.

**Do not generate or execute the Antigravity master prompt from this document until the team approves the contracts and the repository structure.** Build in small phases and review checkpoints.

### 0.1 Non-negotiable engineering invariants

1. An SOS is acknowledged to a citizen only after its durable PostgreSQL transaction commits.
2. A committed SOS must be recoverable even if RabbitMQ, Redis, an app instance or a worker is unavailable.
3. Every asynchronous consumer must tolerate redelivery; retries must not create duplicate business effects.
4. Redis locks and cache entries must never be the only protection for a business-critical invariant.
5. RabbitMQ publication and consumption must use durable topology, publisher confirms and manual acknowledgements where applicable.
6. A team must not be assigned to two active incidents, even when two application instances race.
7. A resident must not receive the same alert twice on the same channel.
8. AI may prioritise and explain; it must not silently discard or auto-close a citizen report.
9. A feature is not complete until its normal path and at least one relevant failure/recovery path have been tested.
10. The UI must distinguish accepted, queued, processing, assigned and failed/retry states honestly.

---

## 1. Challenge scope

AlertNet is a flood-response platform with four connected surfaces:

- A citizen SOS web app that works on weak networks, queues reports while offline, and supports English, Hindi and Telugu.
- An authority console for zone-wise warnings through SMS, app notification and email.
- A live incident command map for grouped SOS reports and rescue-team assignment.
- Asynchronous AI triage and incident grouping, with human override and deterministic fallback.

The system must run at least two stateless application instances and use both RabbitMQ and Redis. The team must build its own retry, delay, dead-letter, locking, rate-limiting and fan-out mechanisms using basic client libraries rather than importing a ready-made workflow/job framework.

### 1.1 Source-stated target outcomes

The uploaded challenge brief specifies:

- At least 1,00,000 simulated residents.
- Three alert channels: SMS, app notification and email.
- Live SOS flow across at least two application instances.
- SOS acknowledgement within 2 seconds.
- Zero lost SOS reports, including across restarts.
- Alert delivery to 1,00,000 residents on three channels within 5 minutes, including a scenario where one channel fails.
- Zero duplicate deliveries per resident per channel.
- Critical incidents visible on the map within 5 seconds.
- Zero double-assigned rescue teams.
- Critical-class F1 score of at least 0.80 on synthetic labelled data.

These are challenge targets, not claims that the team has already achieved them. Report measured results honestly.

### 1.2 Interpretation of the one-channel-failure target

A failed gateway cannot physically deliver while it is unavailable. Therefore demonstrate and measure two things separately:

1. **Isolation:** the two healthy channels continue independently and complete their work without waiting for the failed channel.
2. **Durable recovery:** work for the failed channel remains persisted, retries according to policy, and completes after that channel is restored, without duplicate sends.

Record the elapsed time for healthy channels, the backlog size for the failed channel, recovery time and final delivery counts. If judges interpret the five-minute target as requiring all three channels to finish despite a simulated outage, show the exact failure duration and explain that delivery resumes immediately after recovery. Never label an undelivered message as sent.

---

## 2. Architecture and responsibility boundaries

### 2.1 Proposed components

- **Web client:** citizen PWA and authority/command dashboard.
- **Load balancer / reverse proxy:** routes requests across two stateless Node.js API instances.
- **API instances A and B:** authentication/demo identity, SOS acceptance, alert creation, team assignment, REST and SSE.
- **PostgreSQL:** durable source of truth for residents, teams, incidents, SOS reports, assignments, alerts, batches and deliveries.
- **RabbitMQ:** durable asynchronous work distribution, independent channel workers, SOS triage pipeline, retries and dead-letter queues.
- **Redis:** ephemeral live state, rate limits, cache, presence/geospatial lookup and short-lived coordination optimisations.
- **Workers:** SOS triage/grouping, alert fan-out, SMS simulation, push simulation, email simulation and retry processing.
- **Synthetic-data/load simulator:** creates residents, SOS bursts, duplicate submissions, channel failures and restart drills.

### 2.2 Authority hierarchy

| Concern | Authority |
|---|---|
| SOS existence and citizen idempotency | PostgreSQL |
| Incident membership and assignment truth | PostgreSQL |
| Alert, batch and delivery truth | PostgreSQL |
| Durable asynchronous work | PostgreSQL outbox + RabbitMQ |
| Live cache, counters and ephemeral presence | Redis |
| Fast lock/lease optimisation | Redis, backed by database constraints/transactions |
| UI live updates | SSE as notification; REST/PostgreSQL refetch as truth |

Redis is not the durable database. RabbitMQ is not the only record that an SOS exists.

### 2.3 Two-instance requirement

Run API instance A and B simultaneously behind the same local reverse proxy. Both must use the same PostgreSQL, Redis and RabbitMQ services. Demonstrate that a citizen can submit through A, receive a status update through B, and continue using the system when one API instance is stopped.

---

## 3. Recommended stack

Use the stack already proposed by the team unless a dependency is unavailable:

- Node.js 20+ and Express.
- PostgreSQL 16.
- RabbitMQ 3.13+ with `amqplib`.
- Redis 7 with `ioredis`.
- Server-Sent Events (SSE) for live dashboard updates.
- Leaflet for the map.
- PWA service worker and IndexedDB for offline SOS queue.
- Docker Compose for repeatable local startup.
- Nginx or a simple reverse proxy for two API instances.
- Python/scikit-learn or a small Node-compatible model service for TF-IDF + logistic-regression triage. Keep a deterministic keyword fallback in the API/worker path.

Do not add infrastructure merely because it is fashionable. Prefer the smallest setup that can be started, tested and explained reliably within six hours.

---

## 4. Data model â€” durable PostgreSQL schema

Use migrations and foreign keys. Names can be adapted, but preserve the invariants and uniqueness constraints.

### 4.1 Core tables

**zones**
- `id`, `name`, `boundary` or a simple polygon/geometry representation, `created_at`.

**residents**
- `id`, `zone_id`, `name` or synthetic label, `phone`, `email`, `device_token`, `preferred_language`, `created_at`.
- Add unique constraints for the identifiers used by the simulator.

**teams**
- `id`, `name`, `status`, `capabilities` (JSONB or a simple text array), `last_lat`, `last_lng`, `updated_at`.

**incidents**
- `id`, `zone_id`, `title`, `severity`, `status`, `centroid_lat`, `centroid_lng`, `report_count`, `created_at`, `updated_at`.
- Optional: `cluster_key` or a deterministic spatial/time bucket identifier.

**sos_reports**
- `id` UUID, `resident_id` nullable for anonymous demo mode, `client_request_id` UUID, `zone_id`, `description`, `language`, `lat`, `lng`, `status`, `severity`, `confidence`, `needs` JSONB, `triage_reason`, `triage_version`, `incident_id` nullable, `created_at`, `triaged_at`, `updated_at`.
- Unique `(resident_id, client_request_id)` where resident identity is present. If anonymous submissions are allowed, use a separate unique key strategy such as `(device_id, client_request_id)`; do not leave idempotency ambiguous.
- Preserve the original description and raw input. Never overwrite citizen text with AI output.
- If one-tap category-only SOS is required, allow a structured `category` and generate a safe display description. Do not require free text for emergency submission.

**assignments**
- `id`, `incident_id`, `team_id`, `assigned_by`, `status`, `assigned_at`, `released_at`.
- Enforce one active assignment per team with a partial unique index, e.g. unique `team_id` where status is in active states. Use the exact status set consistently.
- Enforce one active team assignment per incident if the product requires it.

**alerts**
- `id`, `zone_id`, `created_by`, `message`, `severity`, `status`, `idempotency_key`, `created_at`.
- Unique `idempotency_key` so repeated authority submissions do not create duplicate broadcasts.

**alert_batches** â€” mandatory
- `id`, `alert_id`, `channel`, `batch_no`, `status`, `resident_count`, `attempt`, `published_at`, `completed_at`, `created_at`, `updated_at`.
- Unique `(alert_id, channel, batch_no)`.
- Store resident membership durably, either in a child `alert_batch_recipients` table or as a stable JSONB array for a small demo. Prefer the child table for correctness and queryability.
- A batch must be reconstructible after a process crash.

**alert_batch_recipients** (recommended)
- `batch_id`, `resident_id`, `delivery_id` nullable, `created_at`.
- Unique `(batch_id, resident_id)`.

**deliveries**
- `id`, `alert_id`, `resident_id`, `channel`, `status`, `attempt_count`, `provider_message_id`, `last_error`, `next_attempt_at`, `sent_at`, `created_at`, `updated_at`.
- Unique `(alert_id, resident_id, channel)`. This is the durable deduplication authority.

**outbox_events** â€” mandatory for SOS and alert events
- `id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload` JSONB, `status`, `attempt_count`, `next_attempt_at`, `published_at`, `created_at`.
- Index pending rows by status and `next_attempt_at`.
- Insert the business row and its outbox event in the same database transaction.

### 4.2 Required indexes

- `sos_reports(client_request_id)` plus the appropriate composite unique idempotency index.
- `sos_reports(status, created_at)`.
- `sos_reports(incident_id)`.
- `incidents(zone_id, status, severity)`.
- `assignments(team_id)` and partial unique active-team index.
- `deliveries(alert_id, channel, status)`.
- Unique `deliveries(alert_id, resident_id, channel)`.
- `alert_batches(alert_id, channel, status)`.
- `outbox_events(status, next_attempt_at)`.

---

## 5. SOS acceptance â€” corrected request path

### 5.1 Critical rule

**Do not wait for RabbitMQ publisher confirmation before acknowledging an SOS to the citizen.** The citizen acknowledgement means â€œthe report is durably accepted by our database,â€ not â€œall downstream processing has finished.â€

### 5.2 Correct API sequence

1. Client creates a UUID `client_request_id` once and stores it with the offline item.
2. Client submits `POST /api/sos` with the same UUID on every retry.
3. API validates the minimum fields and starts a PostgreSQL transaction.
4. Insert the SOS report. If the idempotency key already exists, return the existing report rather than creating a second one.
5. Insert an `SOS_RECEIVED` outbox event in the same transaction.
6. Commit the transaction.
7. Return `201 Created` for a new report or `200 OK` for an idempotent replay, including report ID and status.
8. An independent outbox publisher reads pending events, publishes persistent RabbitMQ messages with publisher confirms, and marks the outbox event published only after confirmation.
9. If RabbitMQ is unavailable, the outbox row remains pending and is retried. The already-accepted SOS remains safe in PostgreSQL.

### 5.3 Example response

```json
{
  "reportId": "uuid",
  "status": "RECEIVED",
  "accepted": true,
  "message": "Your SOS has been safely received."
}
```

Do not return `TEAM_ASSIGNED` or `ON_THE_WAY` until those states are actually durable.

### 5.4 Offline PWA behavior

- Store queued reports in IndexedDB.
- Generate the client request UUID at initial creation, not on every retry.
- Retry on connectivity restoration and app foreground.
- Background Sync is an enhancement, not the only delivery mechanism; browser support varies.
- Display `Saved on this device â€” waiting for connection` before server acceptance.
- Display `Received by AlertNet` only after the API confirms the database commit.
- Keep retrying safely; server idempotency prevents duplicate reports.

---

## 6. Outbox publisher and RabbitMQ reliability

### 6.1 Outbox publisher behavior

- Claim pending outbox rows using a transaction and `FOR UPDATE SKIP LOCKED`.
- Publish persistent messages to durable exchanges and durable queues.
- Use publisher confirms.
- Mark the outbox event as published only after confirmation.
- If publish confirmation is missing or the process crashes, leave/revert the event as retryable. A duplicate publish is acceptable because consumers are idempotent.
- Use bounded retry delay and expose pending age/count.

### 6.2 Message envelope

Use a consistent envelope:

```json
{
  "eventId": "uuid",
  "eventType": "SOS_RECEIVED",
  "occurredAt": "ISO-8601",
  "schemaVersion": 1,
  "correlationId": "uuid",
  "payload": {
    "reportId": "uuid"
  }
}
```

Keep messages small. Workers should load authoritative records from PostgreSQL by ID instead of trusting stale, large payloads.

### 6.3 RabbitMQ requirements

- Durable exchanges and queues.
- Persistent messages.
- Manual consumer acknowledgements.
- Publisher confirms.
- `prefetch` tuned to worker capacity.
- Retry with increasing delay using explicit retry queues/TTL + dead-letter routing, or a clearly documented delayed-retry mechanism built with basic RabbitMQ features.
- A final dead-letter queue (DLQ) for exhausted/poison messages.
- Monitor queue depth, unacked messages, retry counts and DLQ depth.

Do not acknowledge a message before the durable database work it represents has completed.

---

## 7. SOS triage and incident grouping â€” corrected crash recovery

### 7.1 Triage labels and outputs

Classify each report as:

- `CRITICAL`: immediate threat to life, trapped people, severe injury or similarly urgent danger.
- `URGENT`: significant assistance required but no explicit immediate life threat.
- `INFORMATIONAL`: general flooding, road condition or non-emergency information.

Extract needs such as `MEDICAL`, `RESCUE`, `FOOD`, `WATER`, `SHELTER` and `EVACUATION`. Store confidence, explanation, model/rule version and human override audit data.

### 7.2 Processing order

1. Consume `SOS_RECEIVED`.
2. Load report from PostgreSQL.
3. If triage fields are missing, run the model; if model unavailable, use deterministic keyword rules.
4. Persist severity, confidence, needs, explanation and `triaged_at`.
5. If `incident_id` is still null, run grouping and attach the report to an incident.
6. Persist incident membership and aggregate count/centroid in a transaction.
7. Emit an incident update/outbox event.
8. Acknowledge the RabbitMQ message only after the durable triage and association work is complete.

### 7.3 The redelivery bug to avoid

Do **not** implement â€œif `triaged_at` exists, acknowledge and skip.â€ A worker can save triage, crash before incident association, and then redelivery would skip the report forever.

Correct idempotent state handling:

- `triaged_at IS NULL` â†’ classify and persist.
- `triaged_at IS NOT NULL AND incident_id IS NULL` â†’ skip reclassification if the saved result is valid, but continue grouping/association.
- `triaged_at IS NOT NULL AND incident_id IS NOT NULL` â†’ durable work is complete; acknowledge duplicate delivery.
- If a report was intentionally left ungrouped, represent that with an explicit durable state/reason and a retry policy rather than treating null as complete.

Use row-level locking or conditional updates to prevent concurrent workers from racing on the same report. Incident creation and report association should be transactional and protected by a deterministic grouping key/unique constraint where feasible.

### 7.4 Human override

- Commanders can override severity and needs.
- Store `original_severity`, `override_severity`, `override_reason`, `overridden_by`, `overridden_at`.
- A later re-triage must not silently erase a human override.
- AI must never delete, reject or auto-close a report.

### 7.5 Model and evaluation

Recommended baseline: TF-IDF + logistic regression, with deterministic keyword rules as fallback. A remote LLM may be used only if latency, availability and cost are controlled; it must not be required for SOS acceptance.

For the critical-class F1 target:

- Create 200â€“300 or more labelled examples if time allows.
- Balance the classes enough to make the metric meaningful.
- Include English, Hindi, Telugu and mixed-language examples.
- Split by underlying scenario/template, not random near-duplicate rows, to prevent leakage.
- Keep a held-out test set untouched during tuning.
- Report precision, recall, F1 and confusion matrix for each class, especially Critical.
- Record the model version and test-set size.
- Do not claim F1 â‰¥ 0.80 unless it is measured on held-out examples.

---

## 8. Incident grouping and spatial logic

Use a simple, explainable baseline that can be defended:

- Candidate reports must be within a configurable distance threshold and time window.
- Optionally require compatible flood/incident category.
- Use a geospatial index or a coarse spatial/time bucket to find candidates quickly.
- Use Redis GEO or cached spatial buckets for candidate discovery, but persist final incident membership in PostgreSQL.
- Avoid creating duplicate incidents under concurrent workers: use deterministic grouping keys, transaction locks or a unique constraint, then re-check candidate incidents inside the transaction.
- Do not merge reports solely because their text is similar if locations/times are far apart.
- Preserve each source SOS report even when grouped.

The map should display one incident marker with report count and severity, while allowing commanders to inspect the underlying reports.

---

## 9. Team assignment â€” database-enforced correctness

### 9.1 Do not rely on a Redis lock alone

A Redis lock without TTL can remain stuck if a process crashes. A lock with TTL can expire while the original process is still working. Redis is therefore an optimisation, not the final correctness boundary.

### 9.2 Required assignment transaction

- Start a PostgreSQL transaction.
- Lock the team row using `SELECT ... FOR UPDATE`.
- Verify the team is available and eligible for the incident.
- Insert the assignment.
- Rely on the partial unique index to reject a second active assignment for the same team.
- Update team/incident state as required.
- Commit.
- Return success only after commit.

If using a Redis lease to reduce contention:
- Set a short TTL.
- Use a random owner token.
- Release only if the stored token matches the owner token.
- Renew only while the process still owns the lease.
- Never treat lease acquisition as proof that the database assignment is valid.

### 9.3 Race test

Send two simultaneous assignment requests through different API instances for the same team. Exactly one must succeed; the other must receive a clear conflict response. Confirm the database contains only one active assignment.

---

## 10. Mass alert broadcast â€” durable fan-out and deduplication

### 10.1 Alert creation

- Authority creates an alert with an idempotency key.
- Insert alert and `ALERT_CREATED` outbox event in one PostgreSQL transaction.
- Return accepted status after commit.
- The fan-out worker loads eligible residents in the selected zone and creates durable batches independently for SMS, push and email.

### 10.2 Mandatory `alert_batches` recovery design

Proposal A is approved as mandatory. Without durable batch records, a crash halfway through fan-out cannot reliably determine which batches were created or published.

For each alert and channel:
1. Create deterministic batch numbers.
2. Persist each batch and its recipients before publishing.
3. Use unique `(alert_id, channel, batch_no)` and `(batch_id, resident_id)` constraints.
4. Publish each batch with publisher confirms.
5. Mark the batch published only after confirmation.
6. On restart, scan `PENDING` or expired `PUBLISHING` batches and republish safely.
7. Consumers use the durable delivery unique key to prevent duplicate delivery effects.

### 10.3 Delivery deduplication

The durable key is `(alert_id, resident_id, channel)` in PostgreSQL. Redis may cache dedupe state for speed, but it must not be the only dedupe authority.

Before simulated send:
- Create or claim the delivery row transactionally.
- If already `SENT`, do not send again.
- If pending/retryable, claim it with a lease/attempt token.
- On successful simulated provider response, persist `SENT` and `sent_at`.
- If the worker crashes after the provider accepted a real message but before the database records success, exactly-once external delivery cannot be guaranteed unless the provider supports idempotency keys. For the hackathon simulator, make the fake gateway idempotent using the delivery ID and explain this boundary honestly.

### 10.4 Independent channels

Each channel must have its own queue, worker pool, rate limiter, retry schedule and DLQ:

- `alerts.sms`
- `alerts.push`
- `alerts.email`

A failure in SMS must not block push or email. Use channel-specific concurrency and rate limits. Simulated gateways should support controlled latency, error rate, full outage and recovery.

### 10.5 Retry policy

- Use exponential backoff with a maximum delay and maximum attempt count.
- Store `attempt_count`, `next_attempt_at` and `last_error`.
- Route exhausted deliveries to the channel DLQ.
- Provide a controlled replay/recovery action for DLQ items.
- Retry only failed/pending deliveries, not the entire completed batch.
- Group retry work by channel and attempt tier where practical.

---

## 11. Redis key conventions and safety

Use a consistent namespace; do not mix incompatible counter names.

Suggested keys (adjust names once and keep them consistent):

| Key | Purpose | TTL / durability |
|---|---|---|
| `ratelimit:sos:{deviceId}` | SOS rate limit | Short TTL |
| `incident:live:{incidentId}` | Cached live incident summary | TTL; rebuild from DB |
| `team:lease:{teamId}` | Optional assignment lease with owner token | Short TTL |
| `zone:counts:{zoneId}` | Live zone counters | Rebuildable |
| `delivery:cache:{alertId}:{residentId}:{channel}` | Delivery fast-path cache | Short TTL; DB authoritative |
| `sse:presence:{instanceId}` | Instance presence/heartbeat | Short TTL |
| `metrics:delivery:{channel}:sent` | Sent counter | Rebuildable/observability only |
| `metrics:delivery:{channel}:failed` | Failed counter | Rebuildable/observability only |
| `metrics:delivery:{channel}:dead` | DLQ counter | Rebuildable/observability only |

Rules:
- Set TTL on all ephemeral locks, leases, rate-limit and presence keys.
- Use Lua scripts for atomic multi-key rate-limit operations where necessary.
- Do not use Redis counters as the sole source for evaluation totals.
- Do not let a Redis outage prevent a committed SOS from being accepted.
- On Redis recovery, rebuild live views from PostgreSQL and RabbitMQ state.

---

## 12. API contracts

Keep APIs small and stable. Use the exact field names consistently in frontend, backend and tests.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/sos` | Accept idempotent citizen SOS |
| `GET` | `/api/sos/:id` | Read SOS status |
| `GET` | `/api/incidents` | List/filter incidents |
| `GET` | `/api/incidents/:id` | Incident detail and source reports |
| `POST` | `/api/incidents/:id/assign` | Assign a team transactionally |
| `POST` | `/api/incidents/:id/override` | Human severity/needs override |
| `POST` | `/api/alerts` | Create idempotent zone alert |
| `GET` | `/api/alerts/:id` | Alert/batch/delivery summary |
| `GET` | `/api/metrics` | Operational metrics |
| `GET` | `/api/events` | SSE stream |

### 12.1 Error semantics

- `400`: invalid input.
- `401/403`: unauthorised.
- `404`: missing resource.
- `409`: idempotency conflict or assignment conflict where appropriate.
- `429`: rate limit exceeded; include retry guidance.
- `503`: service cannot safely accept the request because PostgreSQL is unavailable. Do not claim acceptance.
- RabbitMQ unavailable alone should not force SOS API failure if PostgreSQL and the outbox are healthy.

---

## 13. Real-time updates

Use SSE for:
- New SOS accepted/triaged.
- Incident created/updated.
- Team assignment changes.
- Alert batch and channel delivery progress.

SSE is a notification channel, not the source of truth. On reconnect, clients must refetch current state from REST endpoints. Include event IDs or timestamps so the UI can detect gaps. Do not rely on a single in-memory event bus across two API instances; use Redis Pub/Sub only as a live notification aid or publish updates through a shared durable/event path.

---

## 14. Frontend requirements and scope control

### 14.1 Citizen PWA

- Large SOS action and accessible touch targets.
- English, Hindi and Telugu labels for essential flows.
- Category selection and optional text/voice transcription if time allows.
- Offline IndexedDB queue.
- Stable idempotency UUID per report.
- Clear states: `SAVED_OFFLINE`, `RECEIVED`, `TRIAGING`, `TEAM_ASSIGNED`, `TEAM_ON_THE_WAY`, `RESOLVED`.
- Never display â€œhelp is on the wayâ€ unless a team assignment/status confirms it.

### 14.2 Command centre

- Live incident map using Leaflet.
- Severity conveyed by text/icon/shape as well as colour.
- Cluster/group markers and report counts.
- Filters by zone, severity and status.
- Incident detail panel with original reports, needs, AI explanation and override controls.
- Team availability and assignment action.
- Alert creation and delivery progress.
- Dashboard metrics and queue/DLQ visibility.

### 14.3 UI priority

A working, truthful interface beats a polished but misleading one. Use a simple layout first. Do not spend the first half of the hackathon on visual polish.

---

## 15. Observability and metrics

At minimum expose:
- SOS accepted count.
- SOS accepted per second, with a defined rolling window (e.g. 10-second and 60-second rates).
- Oldest pending outbox event age and pending count.
- RabbitMQ queue depth and unacked count per queue.
- Triage latency p50/p95 and critical incident visibility latency.
- Unassigned critical incident count.
- Alert recipient count and batch count per channel.
- Delivery sent/failed/retrying/dead counts per channel.
- Duplicate requests detected.
- Assignment conflicts.
- Instance health and last heartbeat.

Use PostgreSQL records for final test evidence. Redis counters can drive live dashboards but should be reconstructible. Record test start/end timestamps and simulator inputs so results are reproducible.

---

## 16. Failure drills and acceptance tests

These tests are the core of the demo. Run them repeatedly and keep evidence.

### 16.1 SOS durability and idempotency

1. Submit the same client request UUID five times through alternating API instances.
2. Expect one durable SOS row and one logical outbox event.
3. Stop RabbitMQ before submission.
4. Expect SOS accepted within the target if PostgreSQL is healthy.
5. Restore RabbitMQ and verify the outbox publisher eventually publishes the event.
6. Restart an API instance/worker during processing.
7. Verify the report remains and triage/grouping resumes without duplication.

**Pass:** zero lost reports, one logical report per idempotency key, no false acceptance before DB commit.

### 16.2 Triage crash recovery

1. Force a worker crash after saving triage but before incident association.
2. Redeliver the message.
3. Verify the worker resumes grouping/association rather than skipping.
4. Verify final report has valid triage and incident association or an explicit retryable grouping state.

**Pass:** no permanently stranded triaged-but-ungrouped report.

### 16.3 Team assignment race

1. Send two concurrent assignment requests for the same team through different API instances.
2. Verify one succeeds and one conflicts.
3. Inspect PostgreSQL active assignments.

**Pass:** exactly one active assignment for the team.

### 16.4 Broadcast throughput and channel isolation

Run a simulator for 1,00,000 residents and all three channels.

Test A â€” normal throughput:
- All three simulated channels enabled.
- Measure resident-channel delivery count and total elapsed time.
- Target: 1,00,000 residents across three channels within 5 minutes, if the hardware and simulator support it.

Test B â€” one-channel failure:
- Disable one channel (e.g. SMS).
- Confirm push and email continue independently.
- Confirm failed-channel work remains durably pending/retryable.
- Confirm no false `SENT` status for the failed channel.

Test C â€” recovery:
- Restore the failed channel.
- Confirm its pending deliveries drain.
- Confirm final unique delivery count per `(alert, resident, channel)` equals the eligible recipient count.
- Confirm no duplicate delivery effects.

Report both channel-specific elapsed times and total end-to-end recovery time. Do not combine â€œqueuedâ€ and â€œsentâ€ into one success number.

### 16.5 Redis interruption

1. Interrupt Redis while API instances and PostgreSQL remain available.
2. Submit SOS and attempt assignment.
3. Verify SOS acceptance still depends on PostgreSQL/outbox.
4. Verify assignment correctness still depends on PostgreSQL transaction/constraints.
5. Restore Redis and rebuild caches.

**Pass:** Redis loss does not cause lost SOS or double assignment.

### 16.6 Instance interruption

1. Stop API instance A during traffic.
2. Continue submissions through instance B.
3. Restore A.
4. Verify all committed reports and live state are consistent.

**Pass:** service continues through the surviving instance; no report loss.

### 16.7 Surge/backpressure

Send a burst approximately 20 times the normal simulator rate.
- API should validate and durably accept within capacity.
- Async processing should queue and prioritise critical work.
- If capacity is genuinely exhausted, return an honest retryable error; never return accepted for a report that was not committed.

### 16.8 AI evaluation

- Use a held-out labelled test set.
- Report per-class precision, recall and F1.
- Critical F1 target: at least 0.80.
- Include confusion matrix and language coverage.
- Clearly label the result as synthetic-data evaluation.

---

## 17. Synthetic data and simulators

Create deterministic seed scripts for:
- 1,00,000 residents distributed across zones.
- Rescue teams with varied capabilities and locations.
- SOS reports with labelled severity, needs, language and coordinates.
- Near-duplicate reports around shared flood events.
- Broadcast load with deterministic resident/channel recipient sets.

Simulators should support:
- Duplicate SOS retries.
- Offline-to-online replay.
- 20x SOS surge.
- Channel latency and failure toggles.
- Worker crash at controlled processing stages.
- RabbitMQ restart.
- Redis interruption.
- API instance stop/start.
- Concurrent assignment race.

Use a fixed random seed for repeatability. Keep simulator code separate from production request handlers.

---

## 18. Security and responsible handling

- Use synthetic resident data only for the hackathon demo.
- Do not expose phone/email/device tokens in public dashboard payloads.
- Validate and bound user text and coordinates.
- Add basic rate limits per device/IP.
- Keep admin/commander actions behind a simple demo role check.
- Record human overrides and assignment actions.
- Avoid presenting AI severity as a medical diagnosis or guaranteed rescue assessment.
- Use clear citizen messaging that the platform has received the report, not that emergency services have necessarily dispatched help.

---

## 19. Team ownership â€” four parallel workstreams

Assign one owner per workstream, with one integrator responsible for shared contracts and merges.

1. **Citizen SOS + API reliability:** PWA, offline queue, idempotency, SOS API, outbox integration.
2. **Broadcast pipeline:** alert creation, durable batches, channel workers, retries, DLQs, simulator.
3. **Command centre + assignment:** map, incident views, team assignment transaction, SSE and dashboard.
4. **AI triage + grouping + evaluation:** labelled data, classifier/rules fallback, crash-safe consumer, clustering and metrics.

Shared rules:
- Agree event names, API payloads, DB migrations and Redis naming before parallel work.
- Commit small, run tests before merge.
- Do not let two workstreams independently redefine the same schema.
- Keep one integration branch and a known-good runnable checkpoint.
- Every checkpoint report must include changed files, commands run, tests passed/failed, known risks and next steps.

---

## 20. Six-hour execution schedule

The six-hour plan is intentionally vertical-slice driven. The system must be runnable early; do not postpone integration until the end.

| Time | Phase | Required outcome |
|---|---|---|
| 0:00â€“0:30 | Contracts and repository | Freeze API/event/schema names, create repo, Docker Compose skeleton, assign owners |
| 0:30â€“1:15 | Foundation | PostgreSQL migrations, RabbitMQ/Redis connections, two API instances, health checks, basic UI shell |
| 1:15â€“2:15 | SOS vertical slice | PWA/API submission, DB idempotency, outbox publisher, RabbitMQ consumer, status read-back |
| 2:15â€“3:15 | Intelligence + command slice | Triage/rules fallback, crash-safe processing, incident grouping, map display, assignment transaction |
| 3:15â€“4:15 | Alert vertical slice | Alert creation, durable alert batches, three independent channel workers, delivery dedupe and progress |
| 4:15â€“5:00 | Scale and metrics | Seed 1,00,000 residents, load simulator, queue/delivery metrics, critical visibility timing |
| 5:00â€“5:40 | Failure drills | RabbitMQ down/restart, Redis interruption, one API instance stop, channel failure/recovery, assignment race |
| 5:40â€“6:00 | Freeze and judge demo | Fix only showstopper bugs, prepare architecture/decision record, capture test evidence, rehearse demo |

### 20.1 Six-hour prioritisation

**P0 â€” must work**
- Two API instances.
- Durable idempotent SOS acceptance.
- Outbox recovery when RabbitMQ is unavailable.
- Basic asynchronous triage with rules fallback.
- Incident map with critical visibility.
- Database-enforced team assignment.
- Three independent alert channel workers.
- Durable batch recovery and per-channel dedupe.
- 1,00,000-resident synthetic broadcast test.
- Core failure demonstrations.

**P1 â€” implement if P0 is stable**
- Full offline PWA polish and all language translations.
- Human override audit UI.
- Advanced map clustering and filters.
- Detailed metrics charts and richer observability.
- More sophisticated model tuning.

**P2 â€” do not risk the core build for these**
- Voice input.
- Complex route optimisation.
- Real SMS/email provider integration.
- Production-grade authentication.
- Advanced ML architecture beyond a measurable baseline.

### 20.2 Compressed 4-hour fallback

If the organisers enforce the four-hour duration stated in the uploaded brief:
- 0:00â€“0:20 contracts and startup.
- 0:20â€“1:20 SOS acceptance + outbox + two instances.
- 1:20â€“2:10 triage + incident map + assignment.
- 2:10â€“3:00 durable alert batches + three simulated workers.
- 3:00â€“3:40 run the highest-value failure drills and 1,00,000-resident simulator.
- 3:40â€“4:00 freeze, evidence and demo rehearsal.

In the compressed plan, reduce UI polish and advanced analytics first. Do not remove PostgreSQL idempotency, outbox recovery, assignment constraints or delivery dedupe.

---

## 21. Architecture and decision record for judges

Prepare a one-page record with:

**Decision 1 â€” PostgreSQL outbox for SOS acceptance**
- Choice: commit SOS and outbox event together; publish asynchronously.
- Alternative: publish to RabbitMQ in the request before acknowledging.
- Reason: RabbitMQ outage must not lose or block a durably accepted SOS.

**Decision 2 â€” PostgreSQL assignment invariant**
- Choice: row lock + partial unique index; Redis lease is optional optimisation.
- Alternative: Redis lock as sole guarantee.
- Reason: lock expiry/crash behaviour must not permit double assignment.

**Decision 3 â€” Durable alert batches**
- Choice: persist batches and recipients before publishing.
- Alternative: generate/publish batches only in memory.
- Reason: fan-out must resume after process restart.

**Decision 4 â€” At-least-once processing with idempotent effects**
- Choice: manual ack after durable processing; dedupe in PostgreSQL.
- Alternative: assume exactly-once message delivery.
- Reason: message brokers and workers can redeliver after uncertain failures.

**Decision 5 â€” AI with deterministic fallback and human override**
- Choice: async ML triage, rules fallback, preserve source report and audit overrides.
- Alternative: make SOS acceptance depend on the model.
- Reason: AI must not delay or prevent emergency report acceptance.

---

## 22. Definition of done

The project is ready for the judge demo when:

- [ ] Docker Compose starts PostgreSQL, RabbitMQ, Redis, two API instances and workers.
- [ ] Health checks prove both API instances are running.
- [ ] SOS is committed before acknowledgement.
- [ ] Repeated submission with the same client UUID creates one report.
- [ ] RabbitMQ outage leaves SOS outbox events pending and recoverable.
- [ ] Triage redelivery resumes incident association after a simulated crash.
- [ ] Critical incidents appear on the command map within the measured target.
- [ ] Two concurrent requests cannot assign one team twice.
- [ ] Alert batches and recipients are persisted before publication.
- [ ] SMS, push and email workers fail independently.
- [ ] Delivery dedupe is enforced by PostgreSQL.
- [ ] A failed channel recovers without losing pending deliveries or duplicating successful sends.
- [ ] 1,00,000-resident load test has recorded results.
- [ ] Critical-class F1 is measured on a held-out test set.
- [ ] Redis interruption does not violate durable SOS or assignment invariants.
- [ ] One API instance can stop while the other continues.
- [ ] Architecture diagram and decision record are ready.
- [ ] The demo distinguishes accepted, queued, sent, failed and recovered states truthfully.

---

## 23. Antigravity execution protocol

Do not ask the coding agent to build the entire system in one unreviewed pass.

For each phase:
1. Provide only the approved contract and the current phase scope.
2. Ask the agent to inspect the repository before editing.
3. Require a short implementation plan and files-to-change list.
4. Require small, testable changes.
5. Require it to run relevant tests and report exact commands/results.
6. Review the checkpoint before moving to the next phase.
7. Do not accept â€œimplementedâ€ without evidence.
8. Keep a known-good commit before risky changes.
9. If an agent changes a shared contract, stop and reconcile it with this document before continuing.
10. After each 3â€“4 phases, share the checkpoint report for review and correction.

### Required checkpoint report format

- Phase and objective:
- Files created/modified:
- API/event/schema changes:
- Tests executed:
- Tests passed/failed:
- Failure scenarios tested:
- Known bugs/risks:
- Exact command to start the system:
- Next phase proposal:

---

## 24. Open decisions to freeze before implementation

The team must decide these once, then keep them stable:

1. Whether demo SOS requires resident login or supports anonymous device identity.
2. Coordinate format and distance/time thresholds for incident grouping.
3. Exact active assignment statuses used by the partial unique index.
4. Batch size per channel and simulated gateway rate limits.
5. Retry maximum attempts and delay schedule.
6. Whether push notification is represented as browser push or a simulated app-notification gateway.
7. Model runtime choice: local Python service or in-process baseline.
8. Whether the event organisers will enforce the four-hour brief duration or the team has the confirmed six-hour working window.

Do not block the initial SOS vertical slice on optional UI choices. Freeze the data and event contracts first.

---

## 25. Final build principle

**Make the emergency path reliable before making the dashboard impressive.**

The projectâ€™s strongest story is not merely â€œwe used AI, Redis and RabbitMQ.â€ It is:

- a citizen SOS becomes durable before acknowledgement;
- the system can recover asynchronous work after failures;
- AI helps prioritise without hiding or deleting reports;
- duplicate incident reports are grouped without losing their original records;
- one rescue team cannot be double-booked;
- alert channels fail independently and recover from durable batches;
- the team can prove these behaviours with repeatable tests.

**Master prompt status: NOT YET APPROVED / NOT INCLUDED.** Generate it only after the team reviews and freezes this v2.1 contract.