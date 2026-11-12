# AlertNet Automated Verification and Test Report

## Date: 2026-11-12
## Harness: tests/testSuite.js

---

### Executed Challenge Criteria & Verified Outcomes

| Test ID | Test Description | Invariant Tested | Measured Outcome | Status |
|---|---|---|---|---|
| **TEST 1** | Duplicate SOS Ingestion | Database & Idempotency Key | Exactly 1 durable record stored across 5 retries; duplicate requests return identical accepted status | **PASS** |
| **TEST 2** | Transactional Outbox | Durable Event Publishing | Event recorded in `outbox_events` atomically before worker pickup; 100% resilient to broker restart | **PASS** |
| **TEST 3** | AI Multilingual Triage | Critical-Class F1 Score | Evaluated on synthetic dataset across EN, HI, TE: **F1 = 0.846** (Target &ge; 0.80) | **PASS** |
| **TEST 4** | Team Assignment Race | Concurrency Safety | Secondary concurrent assignment of occupied team rejected by DB constraint & Redis lock | **PASS** |
| **TEST 5** | Warning Fan-Out & Deduplication | Channel Delivery Deduplication | 100,000 residents receive exactly 1 alert per channel; 0 duplicate delivery logs | **PASS** |
| **TEST 6** | Dual Application Instances | Stateless Horizontal Scaling | Both `instance-A` and `instance-B` serve requests through reverse proxy over shared DB/Redis/RabbitMQ | **PASS** |
| **TEST 7** | Offline Citizen Queue | PWA Weak Network Resilience | SOS reports created offline are buffered in client storage and synced automatically upon reconnection | **PASS** |
| **TEST 8** | Channel Failure Isolation | Chaos Simulation | SMS outage simulated; Push and Email continue without delay or cross-channel blocking | **PASS** |

---

### AI Evaluation Details
```json
{
  "totalTestSamples": 31,
  "confusionMatrix": {
    "CRITICAL": { "CRITICAL": 11, "URGENT": 2, "INFORMATIONAL": 0 },
    "URGENT": { "CRITICAL": 2, "URGENT": 8, "INFORMATIONAL": 0 },
    "INFORMATIONAL": { "CRITICAL": 0, "URGENT": 2, "INFORMATIONAL": 6 }
  },
  "criticalMetrics": {
    "truePositives": 11,
    "falsePositives": 2,
    "falseNegatives": 2,
    "precision": 0.846,
    "recall": 0.846,
    "f1Score": 0.846
  },
  "passedTarget": true
}
```
All criteria established by the PS05 Challenge Contract are fulfilled and verified.
