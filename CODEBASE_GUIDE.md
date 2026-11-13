# AlertNet Codebase Guide & Technical Architecture

## 1. Project Overview & Folder Structure
AlertNet is an emergency flood response and citizen SOS operations platform developed for national-scale disaster response (PS05). It implements a high-throughput transactional outbox, asynchronous NLP triage, mutual-exclusivity rescue asset management, and interactive geospatial dispatch.

```
D:\Branches\Projects\Yutvik/
├── data/                      # Persistent SQLite DB (alertnet.db) in WAL mode
├── docs/                      # Architectural specifications and design context
├── public/                    # Frontend static assets
│   ├── app.js                 # Complete Command Center and Citizen UI logic
│   ├── index.html             # Single Page Application HTML (Tailwind CSS, Leaflet)
│   ├── style.css              # Custom styling, dark mode theme, radar pings
│   ├── sw.js                  # Service Worker for PWA & offline queueing
│   └── manifest.json          # PWA metadata
├── src/                       # Backend Node.js / Express application
│   ├── ai/
│   │   ├── triage.js          # Multilingual NLP triage (EN, HI, TE) + spam validator
│   │   └── evaluate.js        # Model evaluation harness (F1 >= 0.80 benchmark)
│   ├── db/
│   │   └── index.js           # SQLite setup, schema initialization, auto-migrations
│   ├── queue/
│   │   └── index.js           # RabbitMQ connection adapter with durable outbox consumer
│   ├── redis/
│   │   └── index.js           # Redis distributed locking and fast cache adapter
│   ├── routes/
│   │   └── api.js             # Express REST API endpoints
│   ├── services/
│   │   ├── sosService.js      # Citizen SOS ingestion, validation, and outbox write
│   │   ├── incidentService.js # Incident lifecycle, team assignment, nearest-suitability
│   │   ├── broadcastService.js# Multi-channel alert dispatch (SMS, Push, Email)
│   │   └── outboxRelay.js     # Transactional outbox background publisher
│   ├── workers/
│   │   ├── sosTriageWorker.js # Asynchronous SOS processing & geospatial clustering
│   │   └── broadcastWorkers.js# Simulated independent channel workers & retry DLQ
│   ├── server.js              # Application entry point (Port 4000)
│   └── loadBalancer.js        # Multi-node load balancing simulator
└── tests/
    └── testSuite.js           # Automated end-to-end test suite (11 test suites)
```

---

## 2. Frontend Entry Points & Important Files
- **Main View Template:** [`public/index.html`](file:///d:/Branches/Projects/Yutvik/public/index.html)
  - Citizen SOS transmission hero and input forms.
  - Tactical Command Center with OpenStreetMap container (`#incidentMap`).
  - Clustered Incidents Queue and Disaster Response Fleet tables.
  - Modals: `#assignModal` (deployment) and `#addTeamModal` (team registration).
- **Frontend Controller:** [`public/app.js`](file:///d:/Branches/Projects/Yutvik/public/app.js)
  - `initLeafletMap()`: Initializes OpenStreetMap standard tiles with tile error handling.
  - `renderMapMarkers(incidents, teams)`: Renders shape/color differentiated markers for incidents and fleet units.
  - `openAddTeamModal()` & form submit: Registers new rescue units with capabilities and GPS.
  - `startTeamLiveTracking(teamId)`: High-accuracy GNSS device tracking via `navigator.geolocation.watchPosition()`.
  - `handleFindNearestTeam(incidentId)`: Queries backend for nearest suitable available team matching all mandatory capabilities.
  - `btnAutoAssignCritical`: One-click atomic auto-dispatch for all open critical incidents.

---

## 3. Backend Entry Points & Core Architecture
- **Server Entry Point:** [`src/server.js`](file:///d:/Branches/Projects/Yutvik/src/server.js)
  - Starts Express on `PORT=4000`, runs schema migrations, launches the `sosTriageWorker` and broadcast channel consumers.
- **REST Router:** [`src/routes/api.js`](file:///d:/Branches/Projects/Yutvik/src/routes/api.js)
  - `POST /api/sos`: Ingests citizen reports with idempotency and spam validation.
  - `GET /api/incidents`: Fetches live clustered incident feed.
  - `GET /api/teams`: Fetches disaster response fleet with capabilities and coordinates.
  - `POST /api/teams`: Adds and persists new rescue team with capabilities and coordinates.
  - `POST /api/teams/:id/location`: Live updates team coordinates from device GNSS or manual input.
  - `GET /api/incidents/:id/nearest-team`: Computes nearest suitable available team.
  - `POST /api/incidents/:id/assign`: Concurrency-safe team assignment guarded by DB constraint and Redis lock.
  - `POST /api/incidents/auto-assign-critical`: Batch auto-assigns open critical incidents.
  - `POST /api/incidents/:id/status`: Updates incident lifecycle (`EN_ROUTE`, `RESOLVED`).

---

## 4. SOS Ingestion & Transactional Outbox Flow
1. **Submission:** Citizen sends emergency details, category, phone, and coordinates via `POST /api/sos`.
2. **Validation:** [`src/ai/triage.js`](file:///d:/Branches/Projects/Yutvik/src/ai/triage.js) `validateSituationDescription` validates text length, character repeats (`aaaaa`), word loops, and keyboard smashes across English, Hindi, and Telugu.
3. **Outbox Persistence:** [`src/services/sosService.js`](file:///d:/Branches/Projects/Yutvik/src/services/sosService.js) inserts the report and an `outbox_events` record in a single atomic SQLite transaction. The citizen receives immediate acknowledgement without waiting on network brokers.
4. **Outbox Relay:** [`src/services/outboxRelay.js`](file:///d:/Branches/Projects/Yutvik/src/services/outboxRelay.js) queries uncommitted outbox events and pushes them to RabbitMQ queue `sos.triage`.
5. **Clustering & Triage:** [`src/workers/sosTriageWorker.js`](file:///d:/Branches/Projects/Yutvik/src/workers/sosTriageWorker.js) processes the message, calculates priority score via multilingual NLP, and groups reports within 1.5 km into an operational `incidents` record.

---

## 5. Intelligent Nearest Suitable Rescue Assignment
Implemented in [`src/services/incidentService.js`](file:///d:/Branches/Projects/Yutvik/src/services/incidentService.js):
- **Capability Matching:** Function `getRequiredCapabilities(incident)` maps extracted needs and categories to mandatory capability tags (`underwater_rescue`, `water_rescue`, `boat_rescue`, `medical_evacuation`, `fire_response`, `electrical_hazard_response`, `aerial_rescue`, `general_disaster_response`). If multiple are present, a team must satisfy **all** mandatory capabilities.
- **Eligibility Filtering:** Excludes teams with status $\ne$ `'AVAILABLE'`, teams with an existing active assignment (`current_incident_id IS NOT NULL`), and teams lacking mandatory capabilities.
- **Geographic Proximity:** Calculates straight-line distance via `haversineDistance()` in kilometers between incident coordinates and team coordinates.
- **Concurrency & Double-Booking Protection:**
  1. Distributed Redis lock `assign:team:<teamId>` prevents concurrent commanders or instances from assigning the same team.
  2. Database atomic transaction checks team availability and enforces SQLite `UNIQUE(assigned_team_id)` constraint on the `incidents` table.
- **Automated Policy:**
  - **Critical Incidents:** Automatically assigned to nearest suitable team via `autoAssignCriticalIncidents()`.
  - **Urgent Incidents:** Recommends nearest suitable team, requiring commander confirmation.
  - **Informational Incidents:** Manual commander control.
  - **Unknown / Ambiguous Needs:** Flags incident for commander review.

---

## 6. Location Tracking & NavIC Compatibility
- **Device Positioning:** Uses browser Geolocation API (`enableHighAccuracy: true`). Compatible with Indian NavIC (IRNSS), GPS, Galileo, and GLONASS at the device GNSS hardware level without proprietary external API keys.
- **Manual Fallback:** If GPS permission is denied or satellite locks fail, users can register manual coordinates or street addresses without blocking emergency SOS reporting.
- **Fleet Live Tracking:** `navigator.geolocation.watchPosition` streams live coordinates to `POST /api/teams/:id/location`, persisting coordinates with `location_source = 'device_gnss'` and updating map markers in real time.

---

## 7. OpenStreetMap GIS Map
- **Standard Endpoint:** `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- **Zero API Keys:** Completely removes broken CARTO watermarked endpoints.
- **Interactive Layers:** Persisted incident coordinates are rendered with severity-coded icons (Red for Critical, Amber for Urgent, Blue for Informational) with 1.5 km clustering visual circles, alongside live rescue fleet unit icons.
- **Resilience:** Integrates Leaflet `invalidateSize()` on view changes and tile error callbacks.

