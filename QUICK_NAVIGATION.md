# AlertNet — Quick Navigation Guide

This quick reference outlines the 20 most important files across the AlertNet repository and their specific architectural responsibilities.

| # | File Path | Primary Function & Responsibility |
|---|---|---|
| 1 | `src/server.js` | Main application entry point: starts Express server on port 4000, initializes database migrations and workers. |
| 2 | `src/routes/api.js` | Express REST API router: routes for citizen SOS, incident queries, team registration, live tracking, nearest-team lookup, and auto-dispatch. |
| 3 | `src/services/incidentService.js` | Core assignment engine: implements Haversine distance, capability matching, nearest suitable team search, and concurrency-safe assignment. |
| 4 | `src/services/sosService.js` | Ingestion service: validates citizen input, enforces idempotency, and records transactional outbox events atomically. |
| 5 | `src/ai/triage.js` | Multilingual NLP triage engine: extracts emergency needs in EN, HI, and TE; calculates priority scores and validates text against spam/gibberish. |
| 6 | `src/db/index.js` | SQLite WAL database adapter: initializes schemas, safe ALTER TABLE migrations, and seeds initial rescue fleets. |
| 7 | `public/index.html` | Single Page Application UI: citizen SOS forms, Command Center deck, OpenStreetMap container, and deployment/registration modals. |
| 8 | `public/app.js` | Main frontend controller: Leaflet map rendering, OpenStreetMap tile binding, live team tracking, and nearest-team assignment dialogs. |
| 9 | `public/style.css` | Tactical dark theme stylesheet: defines telemetry badges, radar pulses, layout panels, and responsive containers. |
| 10 | `src/workers/sosTriageWorker.js` | Asynchronous triage worker: consumes `sos.triage` queue from RabbitMQ, executes AI triage, and clusters reports within 1.5 km into incidents. |
| 11 | `src/services/outboxRelay.js` | Transactional outbox relay: reads uncommitted outbox events from SQLite and durably publishes them to RabbitMQ. |
| 12 | `src/queue/index.js` | RabbitMQ connection manager and fallback in-memory message queue. |
| 13 | `src/redis/index.js` | Redis client providing distributed mutex locking (`assign:team:<id>`) and fast idempotency caching. |
| 14 | `src/workers/broadcastWorkers.js` | Independent delivery workers for SMS, Push, and Email alerts with automated retry and DLQ routing. |
| 15 | `src/services/broadcastService.js` | Mass notification service: generates broadcast campaigns and creates idempotent fan-out records across channels. |
| 16 | `src/ai/evaluate.js` | Model evaluation harness: verifies F1 score against held-out validation sets (Target Critical F1 $\ge 0.80$). |
| 17 | `tests/testSuite.js` | Automated end-to-end test suite: runs 11 rigorous automated verification tests. |
| 18 | `src/loadBalancer.js` | Multi-instance load balancing harness simulating distributed nodes over shared database and Redis state. |
| 19 | `public/sw.js` | Service Worker script handling Progressive Web App caching and offline SOS queue persistence. |
| 20 | `public/manifest.json` | Web Application Manifest configuring installable emergency response PWA metadata. |

