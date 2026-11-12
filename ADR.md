# Architecture Decision Record (ADR)

## Project: AlertNet — Flood Response & Citizen SOS Platform
## Team: Code Alchemists

### ADR 001: Transactional Outbox Pattern for Durable SOS Ingestion
- **Context:** During massive flood events, sudden spikes of citizen SOS submissions occur simultaneously while queue brokers or network connections may experience temporary downtime.
- **Decision:** All incoming SOS reports are persisted in an atomic database transaction alongside an Outbox event record BEFORE any network acknowledgment is sent to the citizen. Background workers relay events to RabbitMQ.
- **Consequences:** Eliminates data loss during application or broker crashes; achieves effectively-once business outcomes.

### ADR 002: Dual-Layer Concurrency Control for Team Assignment
- **Context:** Multiple commanders or distributed application instances may race to assign the same available rescue unit to different emergency incidents.
- **Decision:** Implement distributed Redis mutex locks for low-latency fast checks, backed authoritatively by a `UNIQUE(assigned_team_id)` constraint and atomic database transactions.
- **Consequences:** Guarantees zero double-booking even during split-brain conditions or Redis cache evictions.

### ADR 003: Isolated Fan-Out Pipelines for Emergency Warning Broadcasts
- **Context:** Delivering warnings to 100,000 residents across SMS, Push, and Email must not bottleneck if an external gateway (e.g. telecom SMS provider) fails.
- **Decision:** Use RabbitMQ `fanout` exchange with dedicated durable queues for each channel (`alert.channel.sms`, `alert.channel.push`, `alert.channel.email`).
- **Consequences:** A complete outage on SMS does not impede Email or Push deliveries. Failed channel jobs undergo exponential backoff and route to dead-letter queues.
