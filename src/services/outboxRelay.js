const { db } = require('../db');
const rabbitMQ = require('../queue');
const redis = require('../redis');
const { v4: uuidv4 } = require('uuid');

/**
 * Transactional Outbox Relayer
 * Ensures 100% durable event publishing to RabbitMQ.
 * Even if RabbitMQ is momentarily down, events stay safe in DB and are retried.
 */
async function relayOutboxEvents() {
  const pendingEvents = db.prepare(`
    SELECT * FROM outbox_events 
    WHERE published = 0 
    ORDER BY created_at ASC 
    LIMIT 100
  `).all();

  for (const evt of pendingEvents) {
    try {
      const payload = JSON.parse(evt.payload);
      const queue = evt.event_type === 'SOS_SUBMITTED' ? 'sos.triage' : 'general.events';

      await rabbitMQ.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
        messageId: evt.id,
        persistent: true
      });

      // Mark published
      db.prepare(`
        UPDATE outbox_events 
        SET published = 1, published_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(evt.id);

    } catch (err) {
      db.prepare(`
        UPDATE outbox_events 
        SET retry_count = retry_count + 1 
        WHERE id = ?
      `).run(evt.id);
    }
  }
}

// Background poller interval (every 1 second)
setInterval(relayOutboxEvents, 1000);

module.exports = {
  relayOutboxEvents
};
