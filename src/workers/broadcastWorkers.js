const rabbitMQ = require('../queue');
const { db } = require('../db');

// Global simulation control flags
const SIM_CONFIG = {
  SMS_FAILURE: false,
  EMAIL_FAILURE: false,
  PUSH_FAILURE: false,
  CHANNEL_DELAYS: { SMS: 5, EMAIL: 10, PUSH: 5 }
};

/**
 * Channel Worker Helper
 */
function setupChannelWorker(channelName, queueName) {
  rabbitMQ.consume(queueName, async (msg) => {
    let job;
    try {
      job = JSON.parse(msg.content.toString());
      const { deliveryId, campaignId, residentId, contact, message } = job;

      // Check if simulation failure flag is enabled for this channel
      const isFailed = (channelName === 'SMS' && SIM_CONFIG.SMS_FAILURE) ||
                       (channelName === 'EMAIL' && SIM_CONFIG.EMAIL_FAILURE) ||
                       (channelName === 'PUSH' && SIM_CONFIG.PUSH_FAILURE);

      if (isFailed) {
        throw new Error(`Simulated gateway outage for ${channelName}`);
      }

      // Update database delivery status to DELIVERED
      db.prepare(`
        UPDATE channel_deliveries 
        SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(deliveryId);

      // Increment campaign counter
      const col = channelName.toLowerCase() + '_count';
      db.prepare(`
        UPDATE alert_campaigns 
        SET ${col} = ${col} + 1 
        WHERE id = ?
      `).run(campaignId);

      rabbitMQ.ack(msg);

    } catch (err) {
      if (job) {
        db.prepare(`
          UPDATE channel_deliveries 
          SET status = 'RETRYING', retry_count = retry_count + 1, error_message = ? 
          WHERE id = ?
        `).run(err.message, job.deliveryId);
      }
      rabbitMQ.nack(msg, false, true); // Retries or dead-letters
    }
  });
}

async function startBroadcastWorkers() {
  await rabbitMQ.assertExchange('alert.broadcast', 'fanout');

  // Queue names
  const qSMS = 'alert.channel.sms';
  const qEmail = 'alert.channel.email';
  const qPush = 'alert.channel.push';

  await rabbitMQ.assertQueue(qSMS, { durable: true });
  await rabbitMQ.assertQueue(qEmail, { durable: true });
  await rabbitMQ.assertQueue(qPush, { durable: true });

  await rabbitMQ.bindQueue(qSMS, 'alert.broadcast');
  await rabbitMQ.bindQueue(qEmail, 'alert.broadcast');
  await rabbitMQ.bindQueue(qPush, 'alert.broadcast');

  setupChannelWorker('SMS', qSMS);
  setupChannelWorker('EMAIL', qEmail);
  setupChannelWorker('PUSH', qPush);

  console.log('[Worker] Broadcast Channel Workers (SMS, Push, Email) initialized.');
}

module.exports = {
  startBroadcastWorkers,
  SIM_CONFIG
};
