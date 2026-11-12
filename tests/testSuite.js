const assert = require('assert');
const { db } = require('../src/db');
const { submitSOS } = require('../src/services/sosService');
const { assignTeamToIncident, updateIncidentStatus } = require('../src/services/incidentService');
const { evaluateModel } = require('../src/ai/evaluate');
const { createBroadcastCampaign, seedResidentsIfEmpty } = require('../src/services/broadcastService');

async function runTestSuite() {
  console.log('========================================================');
  console.log('   ALERTNET COMPREHENSIVE AUTOMATED TEST HARNESS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // TEST 1 — Durable SOS Submission & Idempotency
  test('TEST 1: Idempotent SOS Acceptance (Exact 1 record per key across 5 attempts)', () => {
    const testKey = 'test-idem-key-' + Date.now();
    const payload = {
      idempotencyKey: testKey,
      phone: '+919876543210',
      latitude: 17.3850,
      longitude: 78.4867,
      category: 'TRAPPED_FLOOD',
      description: 'Water reached 1st floor, children trapped on roof'
    };

    const res1 = submitSOS(payload);
    assert.strictEqual(res1.status, 'ACCEPTED');
    assert.strictEqual(res1.isDuplicate, false);

    // Repeated attempts with same idempotency key
    for (let i = 0; i < 4; i++) {
      const resDup = submitSOS(payload);
      assert.strictEqual(resDup.status, 'DUPLICATE_ACCEPTED');
      assert.strictEqual(resDup.isDuplicate, true);
    }

    // Verify DB count
    const count = db.prepare('SELECT COUNT(*) as c FROM sos_reports WHERE idempotency_key = ?').get(testKey).c;
    assert.strictEqual(count, 1, 'Database must contain exactly 1 record');
  });

  // TEST 2 — Outbox Transactional Event Persistence
  test('TEST 2: Transactional Outbox Event Durable Storage', () => {
    const outboxEvents = db.prepare('SELECT * FROM outbox_events WHERE published = 0 OR published = 1').all();
    assert(outboxEvents.length > 0, 'Outbox must contain recorded events');
  });

  // TEST 3 — AI Emergency Triage F1 Score & Keyword Fallback
  test('TEST 3: AI Model Multilingual F1 Score Evaluation (Target >= 0.80)', () => {
    const results = evaluateModel();
    assert(results.criticalMetrics.f1Score >= 0.80, `Expected F1 >= 0.80, got ${results.criticalMetrics.f1Score}`);
    assert(results.passedTarget === true);
    console.log(`       -> Measured Critical F1: ${results.criticalMetrics.f1Score} (Precision: ${results.criticalMetrics.precision}, Recall: ${results.criticalMetrics.recall})`);
  });

  // TEST 4 — Concurrency-Safe Team Assignment (Prevent Double Booking)
  await testAsync('TEST 4: Team Assignment Race Prevention (Zero Double Assignment)', async () => {
    // Insert test incident A and B
    const incA = 'test-inc-a-' + Date.now();
    const incB = 'test-inc-b-' + Date.now();
    db.prepare("INSERT INTO incidents (id, zone, latitude, longitude, category, status) VALUES (?, 'Zone 1', 17.38, 78.48, 'TRAPPED', 'OPEN')").run(incA);
    db.prepare("INSERT INTO incidents (id, zone, latitude, longitude, category, status) VALUES (?, 'Zone 1', 17.39, 78.49, 'TRAPPED', 'OPEN')").run(incB);

    const team = db.prepare("SELECT * FROM rescue_teams WHERE status = 'AVAILABLE' LIMIT 1").get();
    assert(team, 'Must have at least 1 available team');

    // Assign team to incA
    const resA = await assignTeamToIncident(incA, team.id, 'Commander_1');
    assert.strictEqual(resA.success, true);

    // Attempt concurrent assignment of SAME team to incB -> MUST FAIL
    let failedAsExpected = false;
    try {
      await assignTeamToIncident(incB, team.id, 'Commander_2');
    } catch (e) {
      failedAsExpected = true;
    }
    assert(failedAsExpected, 'Assigning already assigned team must be rejected!');

    // Cleanup & release team
    updateIncidentStatus(incA, 'RESOLVED');
  });

  // TEST 5 — Duplicate Alert Delivery Prevention
  await testAsync('TEST 5: Delivery Deduplication & Fan-Out Isolation', async () => {
    // Seed at least 100 residents for quick test
    seedResidentsIfEmpty(100);

    const broadcastRes = await createBroadcastCampaign({
      title: 'TEST FLOOD ALERT',
      zone: 'ALL',
      severity: 'RED_ALERT',
      messageEn: 'Test emergency warning message'
    });

    assert.strictEqual(broadcastRes.success, true);
    assert(broadcastRes.totalTargetDeliveries >= 300, 'Deliveries must be 3x residents for SMS, Push, Email');

    // Check delivery unique constraint
    const duplicates = db.prepare(`
      SELECT campaign_id, resident_id, channel, COUNT(*) as c 
      FROM channel_deliveries 
      GROUP BY campaign_id, resident_id, channel 
      HAVING c > 1
    `).all();

    assert.strictEqual(duplicates.length, 0, 'Zero duplicate deliveries per resident per channel allowed');
  });

  console.log('\n========================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runTestSuite();
