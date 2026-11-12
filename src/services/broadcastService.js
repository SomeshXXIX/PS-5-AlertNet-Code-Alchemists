const { db } = require('../db');
const rabbitMQ = require('../queue');
const { v4: uuidv4 } = require('uuid');

/**
 * Seed or verify 100,000 synthetic residents
 */
function seedResidentsIfEmpty(count = 100000) {
  const currentCount = db.prepare('SELECT COUNT(*) as count FROM residents').get().count;
  if (currentCount >= count) {
    return currentCount;
  }

  console.log(`[Seed] Generating ${count} synthetic residents for realistic broadcast testing...`);
  const needed = count - currentCount;
  const insert = db.prepare(`
    INSERT INTO residents (id, name, phone, email, push_token, zone, language)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const zones = [
    'Hyderabad Metro Flood Zone',
    'Vijayawada Krishna Riverfront',
    'Warangal Lowlands',
    'Visakhapatnam Coastal Area'
  ];
  const languages = ['en', 'hi', 'te'];

  // Insert in batches of 5,000 for high speed
  const batchSize = 5000;
  for (let i = 0; i < needed; i += batchSize) {
    const end = Math.min(i + batchSize, needed);
    const tx = db.transaction(() => {
      for (let j = i; j < end; j++) {
        const idx = currentCount + j + 1;
        insert.run(
          'res-' + idx,
          'Resident ' + idx,
          '+9198' + String(10000000 + idx).slice(-8),
          `citizen.${idx}@alertnet.gov.in`,
          'push_token_' + idx,
          zones[idx % zones.length],
          languages[idx % languages.length]
        );
      }
    });
    tx();
  }

  console.log(`[Seed] Successfully seeded ${count} residents.`);
  return count;
}

/**
 * Trigger Broadcast Campaign
 * Creates campaign, generates delivery records with idempotency,
 * and fans out 300,000 delivery jobs (100k SMS, 100k Email, 100k Push)
 */
async function createBroadcastCampaign(data) {
  const { title, zone, severity, messageEn, messageHi, messageTe } = data;
  const campaignId = 'camp-' + uuidv4().substring(0, 10);

  // 1. Get residents in zone or all
  const residents = zone === 'ALL'
    ? db.prepare('SELECT id, phone, email, push_token FROM residents').all()
    : db.prepare('SELECT id, phone, email, push_token FROM residents WHERE zone = ?').all(zone);
  const totalResidents = residents.length;

  if (totalResidents === 0) {
    throw new Error(`No residents found in zone: ${zone}. Please seed residents first.`);
  }

  // 2. Insert Campaign Record
  db.prepare(`
    INSERT INTO alert_campaigns (
      id, title, message_en, message_hi, message_te, zone, severity, total_residents, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DISPATCHING')
  `).run(
    campaignId,
    title,
    messageEn,
    messageHi || messageEn,
    messageTe || messageEn,
    zone,
    severity,
    totalResidents
  );

  const insertDelivery = db.prepare(`
    INSERT OR IGNORE INTO channel_deliveries (id, campaign_id, resident_id, channel, status)
    VALUES (?, ?, ?, ?, 'PENDING')
  `);

  console.log(`[Broadcast] Dispatching alert to ${totalResidents} residents across 3 channels (Total ${totalResidents * 3} deliveries)...`);

  // Fast background fan-out process
  setImmediate(async () => {
    const channels = ['SMS', 'PUSH', 'EMAIL'];
    
    // Batch create delivery records
    const chunkSize = 2000;
    for (let i = 0; i < residents.length; i += chunkSize) {
      const slice = residents.slice(i, i + chunkSize);
      const deliveryBatch = [];

      const tx = db.transaction(() => {
        for (const res of slice) {
          for (const ch of channels) {
            const deliveryId = `del-${campaignId}-${res.id}-${ch}`;
            insertDelivery.run(deliveryId, campaignId, res.id, ch);
            deliveryBatch.push({
              deliveryId,
              campaignId,
              residentId: res.id,
              channel: ch,
              contact: ch === 'SMS' ? res.phone : (ch === 'EMAIL' ? res.email : res.push_token),
              message: messageEn
            });
          }
        }
      });
      tx();

      // Dispatch jobs to specific channel queues
      for (const job of deliveryBatch) {
        const qName = job.channel === 'SMS' ? 'alert.channel.sms' : (job.channel === 'EMAIL' ? 'alert.channel.email' : 'alert.channel.push');
        await rabbitMQ.sendToQueue(qName, Buffer.from(JSON.stringify(job)), { persistent: true });
      }
    }

    db.prepare("UPDATE alert_campaigns SET status = 'COMPLETED' WHERE id = ?").run(campaignId);
    console.log(`[Broadcast] Completed fan-out dispatch for campaign ${campaignId}`);
  });

  return {
    success: true,
    campaignId,
    totalResidents,
    totalTargetDeliveries: totalResidents * 3,
    status: 'DISPATCHING'
  };
}

module.exports = {
  seedResidentsIfEmpty,
  createBroadcastCampaign
};
