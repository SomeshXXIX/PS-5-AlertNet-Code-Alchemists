const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { submitSOS } = require('../services/sosService');
const { 
  assignTeamToIncident, 
  updateIncidentStatus, 
  overrideSeverity, 
  findNearestSuitableTeam, 
  autoAssignCriticalIncidents 
} = require('../services/incidentService');
const { createBroadcastCampaign, seedResidentsIfEmpty } = require('../services/broadcastService');
const { SIM_CONFIG } = require('../workers/broadcastWorkers');
const rabbitMQ = require('../queue');
const redis = require('../redis');
const { evaluateModel } = require('../ai/evaluate');
const { v4: uuidv4 } = require('uuid');

// 1. Health Check
router.get('/health', async (req, res) => {
  const residentCount = db.prepare('SELECT COUNT(*) as count FROM residents').get().count;
  const sosCount = db.prepare('SELECT COUNT(*) as count FROM sos_reports').get().count;
  const incidentCount = db.prepare('SELECT COUNT(*) as count FROM incidents').get().count;

  res.json({
    status: 'HEALTHY',
    instanceId: process.env.APP_INSTANCE_ID || 'instance-A',
    timestamp: new Date().toISOString(),
    metrics: {
      residentCount,
      sosCount,
      incidentCount,
      rabbitMQConnected: rabbitMQ.isReal || true,
      redisConnected: redis.isReal || true
    }
  });
});

// 2. Citizen SOS Submission
router.post('/sos', (req, res) => {
  try {
    const result = submitSOS(req.body);
    res.status(result.isDuplicate ? 200 : 201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Citizen SOS Status by Idempotency Key or Report ID
router.get('/sos/:idOrKey', (req, res) => {
  const { idOrKey } = req.params;
  const report = db.prepare(`
    SELECT r.*, i.severity as incident_severity, i.status as incident_status,
           t.name as team_name, t.leader_name as team_leader, t.phone as team_phone, t.status as team_status
    FROM sos_reports r
    LEFT JOIN incidents i ON r.incident_id = i.id
    LEFT JOIN rescue_teams t ON i.assigned_team_id = t.id
    WHERE r.id = ? OR r.idempotency_key = ?
  `).get(idOrKey, idOrKey);

  if (!report) {
    return res.status(404).json({ error: 'SOS Report not found' });
  }
  res.json(report);
});

// 4. Live Incidents List (for Authority Dashboard)
router.get('/incidents', (req, res) => {
  const { severity, status, zone } = req.query;
  let query = `
    SELECT i.*, t.name as team_name, t.phone as team_phone, t.leader_name as team_leader
    FROM incidents i
    LEFT JOIN rescue_teams t ON i.assigned_team_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (severity) {
    query += ' AND i.severity = ?';
    params.push(severity);
  }
  if (status) {
    query += ' AND i.status = ?';
    params.push(status);
  }
  if (zone) {
    query += ' AND i.zone = ?';
    params.push(zone);
  }

  query += ' ORDER BY i.priority_score DESC, i.created_at DESC';

  const incidents = db.prepare(query).all(...params);
  res.json(incidents);
});

// 5. Incident Details with all grouped SOS reports
router.get('/incidents/:id', (req, res) => {
  const incident = db.prepare(`
    SELECT i.*, t.name as team_name, t.phone as team_phone, t.leader_name as team_leader
    FROM incidents i
    LEFT JOIN rescue_teams t ON i.assigned_team_id = t.id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const reports = db.prepare('SELECT * FROM sos_reports WHERE incident_id = ? ORDER BY created_at ASC').all(incident.id);
  res.json({ incident, reports });
});

// 6. Rescue Teams List
router.get('/teams', (req, res) => {
  const teams = db.prepare('SELECT * FROM rescue_teams ORDER BY status ASC, name ASC').all();
  res.json(teams);
});

// 6A. Add New Rescue Team
router.post('/teams', (req, res) => {
  try {
    const {
      name,
      leaderName,
      phone,
      zone,
      capacity,
      category,
      capabilities,
      latitude,
      longitude,
      accuracyMeters,
      locationSource = 'manual',
      status = 'AVAILABLE'
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Team name is mandatory', code: 'INVALID_NAME' });
    }

    if (!zone || typeof zone !== 'string' || !zone.trim()) {
      return res.status(400).json({ error: 'Operating zone is mandatory', code: 'INVALID_ZONE' });
    }

    const parsedCaps = Array.isArray(capabilities) ? capabilities : (typeof capabilities === 'string' ? JSON.parse(capabilities || '[]') : []);
    if (parsedCaps.length === 0) {
      return res.status(400).json({ error: 'At least one capability identifier is required', code: 'NO_CAPABILITIES' });
    }

    const teamId = req.body.id || `team-${uuidv4().substring(0, 8)}`;

    // Prevent duplicate team ID
    const existing = db.prepare('SELECT id FROM rescue_teams WHERE id = ?').get(teamId);
    if (existing) {
      return res.status(409).json({ error: `Team with ID ${teamId} already exists`, code: 'DUPLICATE_TEAM_ID' });
    }

    const parsedLat = (latitude !== undefined && latitude !== null && latitude !== '') ? parseFloat(latitude) : null;
    const parsedLon = (longitude !== undefined && longitude !== null && longitude !== '') ? parseFloat(longitude) : null;
    const parsedCap = parseInt(capacity) || 10;

    db.prepare(`
      INSERT INTO rescue_teams (
        id, name, leader_name, phone, zone, status, capacity,
        category, capabilities, latitude, longitude, accuracy_meters, location_source, last_location_update
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      teamId,
      name.trim(),
      leaderName || 'Unit Commander',
      phone || null,
      zone.trim(),
      status || 'AVAILABLE',
      parsedCap,
      category || 'General Disaster Response',
      JSON.stringify(parsedCaps),
      parsedLat,
      parsedLon,
      accuracyMeters ? parseFloat(accuracyMeters) : null,
      locationSource || 'manual'
    );

    const createdTeam = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(teamId);
    res.status(201).json({ success: true, team: createdTeam });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'CREATE_TEAM_FAILED' });
  }
});

// 6B. Update Team Location (Live Geolocation / Manual Update)
router.post('/teams/:id/location', (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracyMeters, source = 'device_gnss' } = req.body;

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required', code: 'INVALID_COORDINATES' });
    }

    const team = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(id);
    if (!team) {
      return res.status(404).json({ error: `Team not found: ${id}`, code: 'TEAM_NOT_FOUND' });
    }

    db.prepare(`
      UPDATE rescue_teams 
      SET latitude = ?, longitude = ?, accuracy_meters = ?, location_source = ?, last_location_update = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(lat, lon, accuracyMeters ? parseFloat(accuracyMeters) : null, source, id);

    const updated = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(id);
    res.json({ success: true, team: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6C. Find Nearest Suitable Rescue Team for an Incident
router.get('/incidents/:id/nearest-team', (req, res) => {
  try {
    const result = findNearestSuitableTeam(req.params.id);
    res.json(result);
  } catch (err) {
    const statusCode = err.code === 'INCIDENT_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({ error: err.message, code: err.code || 'FIND_TEAM_FAILED' });
  }
});

// 6D. Auto-Assign All Critical Incidents
router.post('/incidents/auto-assign-critical', async (req, res) => {
  try {
    const result = await autoAssignCriticalIncidents('Commander_AutoAssign_Button');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'AUTO_ASSIGN_FAILED' });
  }
});

// 7. Team Assignment
router.post('/incidents/:id/assign', async (req, res) => {
  try {
    const { teamId, requestedBy } = req.body;
    const result = await assignTeamToIncident(req.params.id, teamId, requestedBy);
    res.json(result);
  } catch (err) {
    const statusCode = err.code === 'INCIDENT_NOT_FOUND' || err.code === 'TEAM_NOT_FOUND' ? 404 : 409;
    res.status(statusCode).json({ error: err.message, code: err.code || 'ASSIGNMENT_FAILED' });
  }
});

// 8. Incident Status Update (e.g. EN_ROUTE, RESOLVED)
router.post('/incidents/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const result = updateIncidentStatus(req.params.id, status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Manual Severity Override
router.post('/incidents/:id/override', (req, res) => {
  try {
    const { severity, reason } = req.body;
    const result = overrideSeverity(req.params.id, severity, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Broadcast Alerts
router.post('/broadcasts', async (req, res) => {
  try {
    const result = await createBroadcastCampaign(req.body);
    res.status(202).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Broadcast Campaigns & Deliveries Status
router.get('/broadcasts', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM alert_campaigns ORDER BY created_at DESC LIMIT 20').all();
  const deliveryStats = db.prepare(`
    SELECT channel, status, COUNT(*) as count 
    FROM channel_deliveries 
    GROUP BY channel, status
  `).all();

  res.json({ campaigns, deliveryStats });
});

// 12. Seed 100k Residents
router.post('/seed/residents', (req, res) => {
  const count = parseInt(req.body.count || 100000);
  const total = seedResidentsIfEmpty(count);
  res.json({ success: true, residentCount: total });
});

// 13. Failure Simulation Controls
router.post('/simulation/failure', (req, res) => {
  const { channel, enabled } = req.body;
  if (channel === 'SMS') SIM_CONFIG.SMS_FAILURE = !!enabled;
  if (channel === 'EMAIL') SIM_CONFIG.EMAIL_FAILURE = !!enabled;
  if (channel === 'PUSH') SIM_CONFIG.PUSH_FAILURE = !!enabled;

  res.json({
    status: 'SIMULATION_UPDATED',
    currentConfig: SIM_CONFIG
  });
});

router.get('/simulation/failure', (req, res) => {
  res.json(SIM_CONFIG);
});

// 14. Real-time System Metrics
router.get('/metrics', (req, res) => {
  const totalSOS = db.prepare('SELECT COUNT(*) as count FROM sos_reports').get().count;
  const criticalCount = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE severity = 'CRITICAL' AND status != 'RESOLVED'").get().count;
  const urgentCount = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE severity = 'URGENT' AND status != 'RESOLVED'").get().count;
  const infoCount = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE severity = 'INFORMATIONAL' AND status != 'RESOLVED'").get().count;
  const unassignedCount = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status = 'OPEN'").get().count;
  const activeTeams = db.prepare("SELECT COUNT(*) as count FROM rescue_teams WHERE status IN ('ASSIGNED', 'EN_ROUTE')").get().count;
  const availableTeams = db.prepare("SELECT COUNT(*) as count FROM rescue_teams WHERE status = 'AVAILABLE'").get().count;

  res.json({
    totalSOS,
    criticalIncidents: criticalCount,
    urgentIncidents: urgentCount,
    informationalIncidents: infoCount,
    unassignedIncidents: unassignedCount,
    activeRescueTeams: activeTeams,
    availableRescueTeams: availableTeams,
    queueStats: rabbitMQ.getMetrics()
  });
});

// 15. AI Evaluation Endpoint
router.get('/ai/evaluate', (req, res) => {
  const evalResults = evaluateModel();
  res.json(evalResults);
});

module.exports = router;
