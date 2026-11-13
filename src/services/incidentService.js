const { db } = require('../db');
const redis = require('../redis');

/**
 * Concurrency-Safe Team Assignment Service
 * Protects against race conditions across multiple instances
 * using atomic database transactions, unique index on assigned_team_id,
 * and Redis coordination lock.
 */
async function assignTeamToIncident(targetId, teamId, requestedBy = 'commander') {
  if (!targetId || !teamId) {
    const err = new Error('targetId (incidentId or reportId) and teamId are required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // 1. Acquire distributed Redis lock for team
  const lockKey = `assign:team:${teamId}`;
  const acquired = await redis.acquireLock(lockKey, 5, requestedBy);
  if (!acquired) {
    const err = new Error('Conflict: Team is currently being assigned by another commander/instance');
    err.code = 'TEAM_LOCKED';
    throw err;
  }

  try {
    // 2. Authoritative database transaction with atomic integrity check
    let result;
    const assignTx = db.transaction(() => {
      // Check team availability in database
      const team = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(teamId);
      if (!team) {
        const err = new Error(`Team not found: ${teamId}`);
        err.code = 'TEAM_NOT_FOUND';
        throw err;
      }

      if (team.status !== 'AVAILABLE' || team.current_incident_id) {
        const err = new Error(`Team ${team.name} is already assigned to incident ${team.current_incident_id}`);
        err.code = 'TEAM_ALREADY_ASSIGNED';
        throw err;
      }

      // Check incident status. If not found by incident ID, check if user provided a citizen SOS report ID
      let incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(targetId);
      let resolvedViaReport = false;

      if (!incident) {
        const report = db.prepare('SELECT id, incident_id FROM sos_reports WHERE id = ?').get(targetId);
        if (report && report.incident_id) {
          incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(report.incident_id);
          resolvedViaReport = true;
        }
      }

      if (!incident) {
        const err = new Error(`Incident not found: ${targetId}`);
        err.code = 'INCIDENT_NOT_FOUND';
        throw err;
      }

      const incidentId = incident.id;

      if (incident.status === 'RESOLVED') {
        const err = new Error(`Cannot assign team to resolved incident ${incidentId}`);
        err.code = 'INCIDENT_ALREADY_RESOLVED';
        throw err;
      }

      // Update incident with assigned_team_id (Guarded by DB UNIQUE constraint on assigned_team_id)
      db.prepare(`
        UPDATE incidents 
        SET assigned_team_id = ?, status = 'ASSIGNED', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(teamId, incidentId);

      // Update team status
      db.prepare(`
        UPDATE rescue_teams 
        SET current_incident_id = ?, status = 'ASSIGNED', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(incidentId, teamId);

      // Update all linked SOS reports to TEAM_ASSIGNED
      db.prepare(`
        UPDATE sos_reports 
        SET status = 'TEAM_ASSIGNED', updated_at = CURRENT_TIMESTAMP 
        WHERE incident_id = ?
      `).run(incidentId);

      result = {
        success: true,
        incidentId,
        teamId,
        teamName: team.name,
        resolvedViaReport,
        assignedAt: new Date().toISOString()
      };
    });

    assignTx();
    return result;

  } finally {
    // Release Redis lock
    await redis.releaseLock(lockKey, requestedBy);
  }
}

/**
 * Update incident status (e.g. EN_ROUTE, RESOLVED)
 */
function updateIncidentStatus(incidentId, newStatus) {
  const updateTx = db.transaction(() => {
    const inc = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
    if (!inc) throw new Error('Incident not found');

    db.prepare('UPDATE incidents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, incidentId);

    if (newStatus === 'RESOLVED') {
      if (inc.assigned_team_id) {
        // Free up rescue team
        db.prepare(`
          UPDATE rescue_teams 
          SET status = 'AVAILABLE', current_incident_id = NULL, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(inc.assigned_team_id);

        db.prepare('UPDATE incidents SET assigned_team_id = NULL WHERE id = ?').run(incidentId);
      }

      db.prepare(`
        UPDATE sos_reports 
        SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP 
        WHERE incident_id = ?
      `).run(incidentId);
    } else if (newStatus === 'EN_ROUTE') {
      if (inc.assigned_team_id) {
        db.prepare("UPDATE rescue_teams SET status = 'EN_ROUTE' WHERE id = ?").run(inc.assigned_team_id);
      }
      db.prepare("UPDATE sos_reports SET status = 'TEAM_EN_ROUTE' WHERE incident_id = ?").run(incidentId);
    }
  });

  updateTx();
  return { success: true, incidentId, status: newStatus };
}

/**
 * Manual Commander Override for AI Severity
 */
function overrideSeverity(incidentId, newSeverity, reason) {
  db.prepare(`
    UPDATE incidents 
    SET severity = ?, is_manual_override = 1, ai_explanation = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(newSeverity, `[MANUAL OVERRIDE by Commander]: ${reason || 'Command assessment'}`, incidentId);

  return { success: true, incidentId, severity: newSeverity };
}

// Haversine distance in KM
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Maps incident category and extracted needs to mandatory team capability identifiers.
 * E.g., Person underwater -> underwater_rescue
 * If an incident has multiple mandatory requirements, the selected team must satisfy ALL.
 */
function getRequiredCapabilities(incident) {
  const reqs = new Set();
  const category = (incident.category || '').toUpperCase();
  let needs = [];
  try {
    needs = typeof incident.extracted_needs === 'string' 
      ? JSON.parse(incident.extracted_needs || '[]') 
      : (incident.extracted_needs || []);
  } catch (e) {
    needs = [];
  }
  const needsLower = needs.map(n => String(n).toLowerCase());

  // Check specific needs
  if (needsLower.some(n => n.includes('underwater') || n.includes('diving') || n.includes('drown'))) {
    reqs.add('underwater_rescue');
  }
  if (needsLower.some(n => n.includes('boat') || n.includes('stranded on roof') || n.includes('current'))) {
    reqs.add('boat_rescue');
  }
  if (needsLower.some(n => n.includes('medical') || n.includes('injury') || n.includes('ambulance') || n.includes('medicine'))) {
    reqs.add('medical_evacuation');
  }
  if (needsLower.some(n => n.includes('fire') || n.includes('flame') || n.includes('smoke'))) {
    reqs.add('fire_response');
  }
  if (needsLower.some(n => n.includes('electric') || n.includes('wire') || n.includes('shock') || n.includes('power line'))) {
    reqs.add('electrical_hazard_response');
  }
  if (needsLower.some(n => n.includes('aerial') || n.includes('airlift') || n.includes('helicopter'))) {
    reqs.add('aerial_rescue');
  }

  // Check Category
  if (category.includes('UNDERWATER')) {
    reqs.add('underwater_rescue');
  } else if (category.includes('TRAPPED') || category.includes('FLOOD')) {
    reqs.add('water_rescue');
  } else if (category.includes('MEDICAL')) {
    reqs.add('medical_evacuation');
  } else if (category.includes('FIRE')) {
    reqs.add('fire_response');
  } else if (category.includes('ELECTRICAL')) {
    reqs.add('electrical_hazard_response');
  } else if (category.includes('AERIAL') || category.includes('AIRLIFT')) {
    reqs.add('aerial_rescue');
  } else if (category.includes('EVACUATION')) {
    reqs.add('water_evacuation');
  }

  // If still empty, default to general_disaster_response if standard emergency
  if (reqs.size === 0) {
    if (category.includes('GENERAL') || category === '') {
      reqs.add('general_disaster_response');
    }
  }

  return Array.from(reqs);
}

/**
 * Finds the nearest suitable available rescue team for an incident.
 * Evaluates capability matching, availability, active assignments, and straight-line Haversine distance.
 */
function findNearestSuitableTeam(incidentId) {
  let incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
  if (!incident) {
    const report = db.prepare('SELECT id, incident_id FROM sos_reports WHERE id = ?').get(incidentId);
    if (report && report.incident_id) {
      incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(report.incident_id);
    }
  }

  if (!incident) {
    const err = new Error(`Incident not found: ${incidentId}`);
    err.code = 'INCIDENT_NOT_FOUND';
    throw err;
  }

  if (incident.status === 'RESOLVED') {
    return {
      status: 'INCIDENT_RESOLVED',
      message: 'Incident is already resolved',
      incident
    };
  }

  if (incident.assigned_team_id) {
    const assignedTeam = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(incident.assigned_team_id);
    return {
      status: 'ALREADY_ASSIGNED',
      message: 'Incident already has an assigned team',
      incident,
      team: assignedTeam
    };
  }

  const incLat = parseFloat(incident.latitude);
  const incLon = parseFloat(incident.longitude);
  const hasValidIncCoords = !isNaN(incLat) && !isNaN(incLon) && incLat !== 0 && incLon !== 0;

  const requiredCaps = getRequiredCapabilities(incident);
  if (requiredCaps.length === 0) {
    return {
      status: 'UNKNOWN_REQUIREMENTS',
      message: 'Unknown or ambiguous emergency requirements; commander review required',
      incident,
      requiredCapabilities: []
    };
  }

  // Fetch all available teams with no active assignment
  const availableTeams = db.prepare(`
    SELECT * FROM rescue_teams 
    WHERE status = 'AVAILABLE' AND current_incident_id IS NULL
  `).all();

  // Filter by capabilities
  const eligibleTeams = availableTeams.filter(team => {
    let teamCaps = [];
    try {
      teamCaps = typeof team.capabilities === 'string' ? JSON.parse(team.capabilities || '[]') : (team.capabilities || []);
    } catch (e) {
      teamCaps = [];
    }

    // Must satisfy ALL required capabilities
    return requiredCaps.every(req => {
      if (req === 'medical_evacuation') {
        return teamCaps.includes('medical_evacuation') || teamCaps.includes('first_aid');
      }
      return teamCaps.includes(req);
    });
  });

  if (eligibleTeams.length === 0) {
    return {
      status: 'NO_SUITABLE_TEAM',
      message: 'No available rescue team meets the mandatory capability requirements',
      incident,
      requiredCapabilities: requiredCaps
    };
  }

  // Calculate distance for each eligible team
  const rankedTeams = eligibleTeams.map(team => {
    let teamCaps = [];
    try { teamCaps = JSON.parse(team.capabilities || '[]'); } catch (e) {}

    const tLat = parseFloat(team.latitude);
    const tLon = parseFloat(team.longitude);
    const hasValidCoords = !isNaN(tLat) && !isNaN(tLon) && tLat !== 0 && tLon !== 0;

    let distanceKm = null;
    if (hasValidIncCoords && hasValidCoords) {
      distanceKm = parseFloat(haversineDistance(incLat, incLon, tLat, tLon).toFixed(2));
    }

    return {
      ...team,
      parsedCapabilities: teamCaps,
      distanceKm,
      hasValidCoords
    };
  });

  // Sort by distance (teams with valid coords first sorted ascending, then without coords)
  rankedTeams.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm !== null) return -1;
    if (b.distanceKm !== null) return 1;
    return 0;
  });

  const bestTeam = rankedTeams[0];
  const distanceStr = bestTeam.distanceKm !== null ? `${bestTeam.distanceKm} km` : 'Location unregistered';
  const selectionReason = `Matched mandatory capabilities [${requiredCaps.join(', ')}] with nearest straight-line distance (${distanceStr})`;

  return {
    status: 'SUITABLE_TEAM_FOUND',
    incidentId: incident.id,
    incidentSeverity: incident.severity,
    requiredCapabilities: requiredCaps,
    recommendedTeam: bestTeam,
    rankedCandidates: rankedTeams,
    distanceKm: bestTeam.distanceKm,
    selectionReason
  };
}

/**
 * Auto-assigns all open unassigned CRITICAL incidents to their nearest suitable available teams.
 * Concurrency protected and atomic per incident.
 */
async function autoAssignCriticalIncidents(requestedBy = 'System_AutoAssigner') {
  const criticalIncidents = db.prepare(`
    SELECT * FROM incidents 
    WHERE severity = 'CRITICAL' AND status = 'OPEN' AND assigned_team_id IS NULL
    ORDER BY priority_score DESC, created_at ASC
  `).all();

  const results = {
    totalEvaluated: criticalIncidents.length,
    assigned: [],
    noSuitableTeam: [],
    requiresReview: [],
    failed: []
  };

  for (const inc of criticalIncidents) {
    try {
      const match = findNearestSuitableTeam(inc.id);

      if (match.status === 'SUITABLE_TEAM_FOUND') {
        let assigned = false;
        // Iterate through ranked candidate teams in case first team is racing in Redis
        for (const candidate of match.rankedCandidates) {
          try {
            const assignRes = await assignTeamToIncident(inc.id, candidate.id, requestedBy);
            results.assigned.push({
              incidentId: inc.id,
              teamId: candidate.id,
              teamName: candidate.name,
              distanceKm: candidate.distanceKm,
              selectionReason: match.selectionReason,
              assignedAt: assignRes.assignedAt
            });
            assigned = true;
            break;
          } catch (assignErr) {
            // If team was locked by another instance, try next candidate
            continue;
          }
        }

        if (!assigned) {
          results.failed.push({ incidentId: inc.id, reason: 'Candidate teams were concurrently locked or unavailable' });
        }
      } else if (match.status === 'NO_SUITABLE_TEAM') {
        results.noSuitableTeam.push({ incidentId: inc.id, reason: match.message, requiredCapabilities: match.requiredCapabilities });
      } else if (match.status === 'UNKNOWN_REQUIREMENTS') {
        results.requiresReview.push({ incidentId: inc.id, reason: match.message });
      }
    } catch (err) {
      results.failed.push({ incidentId: inc.id, reason: err.message });
    }
  }

  return results;
}

module.exports = {
  assignTeamToIncident,
  updateIncidentStatus,
  overrideSeverity,
  haversineDistance,
  getRequiredCapabilities,
  findNearestSuitableTeam,
  autoAssignCriticalIncidents
};
