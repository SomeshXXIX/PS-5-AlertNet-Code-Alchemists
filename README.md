# AlertNet — Flood Emergency Response & Citizen SOS Platform

AlertNet is an event-driven, distributed flood disaster response and citizen SOS coordination platform designed for high-density urban flooding scenarios. Built by team **Code Alchemists** for the PS05 Hackathon Challenge.

---

## 1. System Architecture Overview

AlertNet is designed with strict data durability and high-throughput event processing:

- **Stateless Application Instances:** Runs across multiple active API instances (`instance-A` and `instance-B`) fronted by a reverse-proxy load balancer.
- **Durable Storage & Transactional Outbox:** Authoritative persistence in SQLite/PostgreSQL with Write-Ahead Logging (WAL) and immediate Outbox event recording before citizen acknowledgement.
- **Message Broker (RabbitMQ):** Durable exchanges (`alert.broadcast`), durable persistent queues (`sos.triage`, `alert.channel.sms`, `alert.channel.email`, `alert.channel.push`), manual acknowledgements, publisher confirms, and dead-letter queues.
- **Fast Coordination (Redis):** Distributed locks for team assignment race prevention (`assign:team:<id>`), live cache, and incident rate-limiting.
- **AI Multilingual Emergency Triage:** Hybrid multilingual NLP supporting English, Hindi, and Telugu. Extracts critical needs (trapped people, medical assistance, children/elderly at risk, food & water depletion) and calculates Emergency Priority Scores with keyword-based deterministic fallback.
- **PWA & Weak Network Resilience:** Offline local queue with automatic background sync and idempotency key deduplication.

---

## 2. Key Features

1. **Mobile-First Citizen SOS Application:**
   - Geolocation auto-detection with manual fallback.
   - Multilingual support: English, Hindi (हिंदी), and Telugu (తెలుగు).
   - Offline queueing: SOS requests submitted offline are stored in device storage and automatically synced upon reconnection.
   - Idempotency protection: Repeated taps or retries produce zero duplicate records.
   - Transparent tracking: States honestly transition from `RECEIVED` &rarr; `UNDER_REVIEW` &rarr; `TEAM_ASSIGNED` &rarr; `TEAM_EN_ROUTE` &rarr; `RESOLVED`.

2. **Emergency Command Dashboard:**
   - Real-time operational incident queue ranked by Emergency Priority Score.
   - Incident grouping: Clustered by geographic proximity (1.5 km radius) and disaster category.
   - AI Reasoning Display and manual Commander Severity Override.
   - Rescue Unit Fleet Management with NDRF, SDRF, and Coast Guard units.
   - Concurrency-safe team assignments with zero double-booking.

3. **Zone-Wise Warning Broadcast Engine:**
   - 300,000 alert jobs fan-out demonstration across 100,000 synthetic residents.
   - Three completely isolated delivery channels: SMS, Mobile App Push Notifications, and Email.
   - Independent channel failure drills with exponential backoff and dead-letter queues.

---

## 3. Quickstart & How to Run

### Prerequisites
- Node.js (v18+)
- Python (v3.9+)

### Installation
```bash
# Clone the repository
git clone <repo-url>
cd Yutvik

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

### Running the Services
```bash
# Run the AlertNet Server (Single Instance or Master)
node src/server.js

# Or Run Dual-Instance Distributed Topology with Load Balancer:
# Terminal 1: Instance A
PORT=4001 APP_INSTANCE_ID=instance-A node src/server.js

# Terminal 2: Instance B
PORT=4002 APP_INSTANCE_ID=instance-B node src/server.js

# Terminal 3: Reverse Proxy Load Balancer (Port 4000)
node src/loadBalancer.js
```

Access the Web Portal at: `http://localhost:4000`

---

## 4. Running the Automated Test Suite

Run the end-to-end verification harness covering all 12 challenge criteria:
```bash
node tests/testSuite.js
```

---

## 5. Measured AI Triage Evaluation Metrics

- **Test Samples:** 31 synthetic labelled cases across English, Hindi, and Telugu.
- **Critical Precision:** 84.6%
- **Critical Recall:** 84.6%
- **Critical F1-Score:** **0.846** (Exceeds hackathon target of &ge; 0.80)
- **Fallback:** Deterministic keyword-matching if ML subsystem is disrupted.
