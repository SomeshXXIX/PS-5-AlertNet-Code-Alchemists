const { db } = require('../db');
const redis = require('../redis');

/**
 * Concurrency-Safe Team Assignment Service
 * Protects against race conditions across multiple instances
 * using atomic database transactions, unique index on assigned_team_id,
 * and Redis coordination lock.
 */
async function assignTeamToIncident(incidentId, teamId, requestedBy = 'commander') {
  if (!incidentId || !teamId) {
    throw new Error('incidentId and teamId are required');
  }

  // 1. Acquire distributed Redis lock for team
  const lockKey = `assign:team:${teamId}`;
  const acquired = await redis.acquireLock(lockKey, 5, requestedBy);
  if (!acquired) {
    throw new Error('Conflict: Team is currently being assigned by another commander/instance');
  }

  try {
    // 2. Authoritative database transaction with atomic integrity check
    let result;
    const assignTx = db.transaction(() => {
      // Check team availability in database
      const team = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(teamId);
      if (!team) {
        throw new Error('Team not found');
      }

      if (team.status !== 'AVAILABLE' || team.current_incident_id) {
        throw new Error(`Team ${team.name} is already assigned to incident ${team.current_incident_id}`);
      }

      // Check incident status
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      if (incident.status === 'RESOLVED') {
        throw new Error('Cannot assign team to resolved incident');
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

module.exports = {
  assignTeamToIncident,
  updateIncidentStatus,
  overrideSeverity
};
