const rabbitMQ = require('../queue');
const { db } = require('../db');
const { classifyEmergency } = require('../ai/triage');
const { v4: uuidv4 } = require('uuid');

// Compute distance in KM between 2 coordinates
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
 * Worker: Asynchronously triages SOS reports and clusters them into Incidents
 */
async function startSOSTriageWorker() {
  await rabbitMQ.assertQueue('sos.triage', { durable: true });

  rabbitMQ.consume('sos.triage', async (msg) => {
    try {
      const data = JSON.parse(msg.content.toString());
      const { reportId, description, language, affectedPeople, vulnerableCount, latitude, longitude, category } = data;

      // 1. Run AI Multilingual Triage
      const triage = classifyEmergency(description, language, affectedPeople, vulnerableCount);

      // 2. Incident Grouping Logic (Clusters reports within 1.5 KM and same category or critical zone)
      const openIncidents = db.prepare(`
        SELECT * FROM incidents 
        WHERE status != 'RESOLVED' 
        AND category = ?
        ORDER BY created_at DESC 
        LIMIT 20
      `).all(category);

      let targetIncident = null;
      for (const inc of openIncidents) {
        const dist = haversineDistance(latitude, longitude, inc.latitude, inc.longitude);
        if (dist <= 1.5) { // Within 1.5 KM
          targetIncident = inc;
          break;
        }
      }

      const tx = db.transaction(() => {
        let incidentId;
        if (targetIncident) {
          incidentId = targetIncident.id;
          // Update existing incident
          const newReportCount = targetIncident.report_count + 1;
          // Escalate severity if new report is critical
          let finalSeverity = targetIncident.severity;
          if (triage.severity === 'CRITICAL' || targetIncident.severity === 'CRITICAL') {
            finalSeverity = 'CRITICAL';
          } else if (triage.severity === 'URGENT') {
            finalSeverity = 'URGENT';
          }

          // Combine extracted needs
          let existingNeeds = [];
          try { existingNeeds = JSON.parse(targetIncident.extracted_needs || '[]'); } catch (e) {}
          const mergedNeeds = Array.from(new Set([...existingNeeds, ...triage.extractedNeeds]));

          db.prepare(`
            UPDATE incidents 
            SET report_count = ?,
                severity = ?,
                priority_score = MAX(priority_score, ?),
                extracted_needs = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            newReportCount,
            finalSeverity,
            triage.priorityScore,
            JSON.stringify(mergedNeeds),
            incidentId
          );
        } else {
          // Create new incident
          incidentId = 'inc-' + uuidv4().substring(0, 10);
          db.prepare(`
            INSERT INTO incidents (
              id, zone, latitude, longitude, address_hint,
              category, severity, priority_score, report_count,
              extracted_needs, ai_explanation, ai_confidence, ai_method, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'OPEN')
          `).run(
            incidentId,
            'Hyderabad Metro Flood Zone',
            latitude,
            longitude,
            'Area around ' + latitude.toFixed(4) + ', ' + longitude.toFixed(4),
            category,
            triage.severity,
            triage.priorityScore,
            JSON.stringify(triage.extractedNeeds),
            triage.reason,
            triage.confidence,
            triage.method
          );
        }

        // Link SOS report to incident and update status to UNDER_REVIEW
        db.prepare(`
          UPDATE sos_reports 
          SET incident_id = ?, status = 'UNDER_REVIEW', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(incidentId, reportId);
      });

      tx();

      // Successfully processed
      rabbitMQ.ack(msg);

    } catch (err) {
      console.error('[SOS Triage Worker Error]', err);
      rabbitMQ.nack(msg, false, true);
    }
  });

  console.log('[Worker] SOS Triage Worker started.');
}

module.exports = {
  startSOSTriageWorker
};
