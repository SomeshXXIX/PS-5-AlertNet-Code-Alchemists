const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const redis = require('../redis');
const { relayOutboxEvents } = require('./outboxRelay');

/**
 * Durable SOS Ingestion Service
 * 1. Checks idempotency in DB (and fast Redis cache).
 * 2. Saves to durable DB within single transaction.
 * 3. Enqueues event to Transactional Outbox.
 * 4. Commits transaction and returns acknowledgement.
 */
function submitSOS(data) {
  const {
    idempotencyKey,
    phone,
    latitude,
    longitude,
    addressText,
    category,
    description,
    language = 'en',
    affectedPeople = 1,
    vulnerableCount = 0
  } = data;

  if (!idempotencyKey) {
    throw new Error('idempotencyKey is required for durable SOS acceptance');
  }

  // Check if already processed
  const existing = db.prepare('SELECT * FROM sos_reports WHERE idempotency_key = ?').get(idempotencyKey);
  if (existing) {
    return {
      status: 'DUPLICATE_ACCEPTED',
      isDuplicate: true,
      report: existing
    };
  }

  const reportId = 'sos-' + uuidv4().substring(0, 10);
  const outboxId = 'out-' + uuidv4().substring(0, 10);

  // Atomic database transaction
  const insertTx = db.transaction(() => {
    // 1. Insert SOS report
    db.prepare(`
      INSERT INTO sos_reports (
        id, idempotency_key, phone, latitude, longitude,
        address_text, category, description, language,
        affected_people, vulnerable_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED')
    `).run(
      reportId,
      idempotencyKey,
      phone || null,
      parseFloat(latitude) || 17.3850,
      parseFloat(longitude) || 78.4867,
      addressText || 'Reported Location',
      category || 'GENERAL_EMERGENCY',
      description,
      language,
      parseInt(affectedPeople) || 1,
      parseInt(vulnerableCount) || 0
    );

    // 2. Insert Outbox Event
    const payload = JSON.stringify({
      reportId,
      idempotencyKey,
      latitude: parseFloat(latitude) || 17.3850,
      longitude: parseFloat(longitude) || 78.4867,
      category: category || 'GENERAL_EMERGENCY',
      description,
      language,
      affectedPeople: parseInt(affectedPeople) || 1,
      vulnerableCount: parseInt(vulnerableCount) || 0,
      timestamp: Date.now()
    });

    db.prepare(`
      INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
      VALUES (?, 'SOS_REPORT', ?, 'SOS_SUBMITTED', ?)
    `).run(outboxId, reportId, payload);
  });

  insertTx();

  // Fast trigger relay in background
  setImmediate(relayOutboxEvents);

  const freshReport = db.prepare('SELECT * FROM sos_reports WHERE id = ?').get(reportId);

  return {
    status: 'ACCEPTED',
    isDuplicate: false,
    report: freshReport
  };
}

module.exports = {
  submitSOS
};
