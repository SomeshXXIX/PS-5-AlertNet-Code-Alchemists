# AlertNet REST API Documentation

Base URL: `http://localhost:4000/api`

---

### 1. Health & Status
- **`GET /health`**
  - Returns node instance ID, active connections, database counts.
  - Response:
    ```json
    {
      "status": "HEALTHY",
      "instanceId": "instance-A",
      "timestamp": "2026-11-12T18:07:59.295Z",
      "metrics": {
        "residentCount": 100000,
        "sosCount": 12,
        "incidentCount": 4,
        "rabbitMQConnected": true,
        "redisConnected": true
      }
    }
    ```

---

### 2. Citizen SOS Ingestion
- **`POST /sos`**
  - Submits emergency report. Idempotency enforced via `idempotencyKey`.
  - Body:
    ```json
    {
      "idempotencyKey": "sos-client-uuid-987",
      "phone": "+91 98765 43210",
      "latitude": 17.3850,
      "longitude": 78.4867,
      "addressText": "Near Chaderghat bridge, Hyderabad",
      "category": "TRAPPED_FLOOD",
      "description": "Water rising above waist level, 2 elders trapped",
      "affectedPeople": 4,
      "vulnerableCount": 2,
      "language": "en"
    }
    ```
- **`GET /sos/:idOrKey`**
  - Fetches status, incident link, and assigned rescue team.

---

### 3. Authority Incidents Management
- **`GET /incidents`**
  - Returns grouped incidents ranked by Emergency Priority Score.
  - Query params: `severity`, `status`, `zone`.
- **`POST /incidents/:id/assign`**
  - Concurrency-safe team assignment.
  - Body: `{ "teamId": "team-hyd-01", "requestedBy": "Commander_Alpha" }`
- **`POST /incidents/:id/status`**
  - Updates incident lifecycle: `OPEN`, `ASSIGNED`, `EN_ROUTE`, `RESOLVED`.
- **`POST /incidents/:id/override`**
  - Commander manual severity override.
  - Body: `{ "severity": "CRITICAL", "reason": "Dam gates opened upstream" }`

---

### 4. Broadcast Warning Campaigns
- **`POST /broadcasts`**
  - Dispatches warning alerts across SMS, Push, and Email via RabbitMQ fanout.
  - Body:
    ```json
    {
      "title": "RED ALERT: Flood Gates Opened",
      "zone": "ALL",
      "severity": "RED_ALERT",
      "messageEn": "Evacuate low lying areas immediately.",
      "messageHi": "तुरंत सुरक्षित स्थान पर जाएं।",
      "messageTe": "వెంటనే సురక్షిత ప్రాంతాలకు వెళ్లండి."
    }
    ```
- **`GET /broadcasts`**
  - Returns campaign status and real-time delivery counts per channel.

---

### 5. Failure Simulation Controls
- **`POST /simulation/failure`**
  - Toggles gateway outage drills.
  - Body: `{ "channel": "SMS", "enabled": true }`
- **`GET /simulation/failure`**
  - Returns active simulation status.
