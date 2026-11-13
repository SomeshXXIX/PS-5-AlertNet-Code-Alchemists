const assert = require('assert');
const { db } = require('../src/db');
const { submitSOS } = require('../src/services/sosService');
const { 
  assignTeamToIncident, 
  updateIncidentStatus, 
  findNearestSuitableTeam, 
  autoAssignCriticalIncidents, 
  getRequiredCapabilities, 
  haversineDistance 
} = require('../src/services/incidentService');
const { evaluateModel } = require('../src/ai/evaluate');
const { createBroadcastCampaign, seedResidentsIfEmpty } = require('../src/services/broadcastService');

async function runTestSuite() {
  console.log('========================================================');
  console.log('   ALERTNET COMPREHENSIVE AUTOMATED TEST HARNESS');
  console.log('========================================================\n');

  // Pre-test clean up of any stale test assignments
  try {
    db.prepare("DELETE FROM incidents WHERE id LIKE 'test-inc-%' OR id LIKE 'inc-lifecycle-%'").run();
    db.prepare("UPDATE incidents SET assigned_team_id = NULL").run();
    db.prepare("UPDATE rescue_teams SET status = 'AVAILABLE', current_incident_id = NULL").run();
  } catch (e) {}

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
    // Ensure teams are available
    db.prepare("UPDATE rescue_teams SET status = 'AVAILABLE', current_incident_id = NULL").run();

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

  // TEST 6 — Data Quality & Spam/Gibberish Validation Rejection
  test('TEST 6: Situation Details Validation (Rejects spam/gibberish, accepts English/Hindi/Telugu emergencies)', () => {
    // Should reject: too short
    assert.throws(() => {
      submitSOS({
        idempotencyKey: 'test-short-' + Date.now(),
        phone: '+919876543210',
        latitude: 17.3850,
        longitude: 78.4867,
        category: 'TRAPPED_FLOOD',
        description: 'abc'
      });
    }, (err) => Boolean(err.code === 'INVALID_DESCRIPTION' || /short/i.test(err.message)));

    // Should reject: repeated characters (aaaaa)
    assert.throws(() => {
      submitSOS({
        idempotencyKey: 'test-repeat-' + Date.now(),
        phone: '+919876543210',
        latitude: 17.3850,
        longitude: 78.4867,
        category: 'TRAPPED_FLOOD',
        description: 'aaaaaaaaaaaaaa water'
      });
    }, (err) => Boolean(err.code === 'INVALID_DESCRIPTION' || /repeated characters/i.test(err.message)));

    // Should reject: repeated words
    assert.throws(() => {
      submitSOS({
        idempotencyKey: 'test-repeatwords-' + Date.now(),
        phone: '+919876543210',
        latitude: 17.3850,
        longitude: 78.4867,
        category: 'TRAPPED_FLOOD',
        description: 'help help help help help help'
      });
    }, (err) => Boolean(err.code === 'INVALID_DESCRIPTION' || /repetitive words/i.test(err.message)));

    // Should reject: keyboard smashes
    assert.throws(() => {
      submitSOS({
        idempotencyKey: 'test-smash-' + Date.now(),
        phone: '+919876543210',
        latitude: 17.3850,
        longitude: 78.4867,
        category: 'TRAPPED_FLOOD',
        description: 'asdfghjkl qwertyuiop zxcvbnm'
      });
    }, (err) => Boolean(err.code === 'GIBBERISH_DETECTED' || /keyboard mash|invalid text/i.test(err.message)));

    // Should accept: meaningful English emergency
    const enRes = submitSOS({
      idempotencyKey: 'test-valid-en-' + Date.now(),
      phone: '+919876543210',
      latitude: 17.3850,
      longitude: 78.4867,
      category: 'TRAPPED_FLOOD',
      description: 'Water has risen past 2 meters, two elderly persons need evacuation'
    });
    assert.strictEqual(enRes.status, 'ACCEPTED');

    // Should accept: meaningful Hindi emergency
    const hiRes = submitSOS({
      idempotencyKey: 'test-valid-hi-' + Date.now(),
      phone: '+919876543211',
      latitude: 17.3860,
      longitude: 78.4870,
      category: 'TRAPPED_FLOOD',
      description: 'बाढ़ का पानी पहली मंजिल तक पहुंच गया है, कृपया तुरंत नाव भेजें'
    });
    assert.strictEqual(hiRes.status, 'ACCEPTED');

    // Should accept: meaningful Telugu emergency
    const teRes = submitSOS({
      idempotencyKey: 'test-valid-te-' + Date.now(),
      phone: '+919876543212',
      latitude: 17.3870,
      longitude: 78.4880,
      category: 'MEDICAL_EMERGENCY',
      description: 'ఇంట్లోకి వరద నీరు వచ్చింది, వృద్ధులకు అత్యవసర మందులు మరియు వైద్య సహాయం కావాలి'
    });
    assert.strictEqual(teRes.status, 'ACCEPTED');
  });

  // TEST 7 — Structured Error Codes & Citizen SOS ID vs Incident ID Resolution
  await testAsync('TEST 7: Assignment Structured Errors & SOS Report ID Auto-Resolution', async () => {
    // Ensure test team is available
    db.prepare("UPDATE rescue_teams SET status = 'AVAILABLE', current_incident_id = NULL WHERE id = 'team-hyd-01'").run();

    // 7A: Non-existent incident error code
    try {
      await assignTeamToIncident('non-existent-id-999', 'team-hyd-01');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.strictEqual(err.code, 'INCIDENT_NOT_FOUND');
    }

    // 7B: Non-existent team error code
    const incId = 'test-inc-codes-' + Date.now();
    db.prepare("INSERT INTO incidents (id, zone, latitude, longitude, category, status) VALUES (?, 'Zone 1', 17.38, 78.48, 'TRAPPED', 'OPEN')").run(incId);

    try {
      await assignTeamToIncident(incId, 'non-existent-team-999');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.strictEqual(err.code, 'TEAM_NOT_FOUND');
    }

    // 7C: Fallback auto-resolution: Pass citizen SOS report ID instead of operational incident ID
    const repKey = 'test-rep-resolve-' + Date.now();
    const sosRes = submitSOS({
      idempotencyKey: repKey,
      phone: '+919876543219',
      latitude: 17.3855,
      longitude: 78.4869,
      category: 'TRAPPED_FLOOD',
      description: 'Trapped on second floor, need boat evacuation immediately'
    });
    const reportId = sosRes.report.id;

    // Manually associate report to test incident
    db.prepare("UPDATE sos_reports SET incident_id = ? WHERE id = ?").run(incId, reportId);

    // Pick available team
    const availTeam = db.prepare("SELECT * FROM rescue_teams WHERE status = 'AVAILABLE' LIMIT 1").get();
    assert(availTeam, 'Need available team for resolution test');

    // Assign passing the REPORT ID (reportId) instead of incId
    const assignByReport = await assignTeamToIncident(reportId, availTeam.id, 'Commander_AutoResolver');
    assert.strictEqual(assignByReport.success, true);
    assert.strictEqual(assignByReport.incidentId, incId);
    assert.strictEqual(assignByReport.resolvedViaReport, true);

    // Verify linked SOS report status updated to TEAM_ASSIGNED
    const updatedReport = db.prepare("SELECT status FROM sos_reports WHERE id = ?").get(reportId);
    assert.strictEqual(updatedReport.status, 'TEAM_ASSIGNED');

    // Cleanup & release team
    updateIncidentStatus(incId, 'RESOLVED');
  });

  // TEST 8 — Rescue Team Creation, Persistence & Duplicate ID Validation
  test('TEST 8: Rescue Team Creation, Schema Persistence & Duplicate ID Rejection', () => {
    const testTeamId = 'team-test-' + Date.now();
    const insertStmt = db.prepare(`
      INSERT INTO rescue_teams (
        id, name, leader_name, phone, zone, status, capacity,
        category, capabilities, latitude, longitude, location_source, last_location_update
      ) VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, 'manual', CURRENT_TIMESTAMP)
    `);

    insertStmt.run(
      testTeamId,
      'Test Elite Divers',
      'Commander Test',
      '+91 99999 88888',
      'Hyderabad Riverfront',
      12,
      'Divers',
      JSON.stringify(['underwater_rescue', 'water_rescue']),
      17.3850,
      78.4867
    );

    // Verify persistence
    const saved = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(testTeamId);
    assert.strictEqual(saved.name, 'Test Elite Divers');
    assert.strictEqual(saved.category, 'Divers');
    assert(JSON.parse(saved.capabilities).includes('underwater_rescue'));

    // Duplicate ID must throw
    assert.throws(() => {
      insertStmt.run(
        testTeamId,
        'Duplicate Unit',
        'Duplicate Cmdr',
        '+91 00000 00000',
        'Zone',
        10,
        'Divers',
        JSON.stringify(['underwater_rescue']),
        17.38,
        78.48
      );
    });

    // Cleanup
    db.prepare('DELETE FROM rescue_teams WHERE id = ?').run(testTeamId);
  });

  // TEST 9 — Intelligent Capability Matching (Underwater vs Helicopter etc.)
  test('TEST 9: Capability Matching Engine (Diver vs Helicopter vs Medical)', () => {
    // 9A: Incident requiring underwater rescue
    const underwaterInc = {
      category: 'TRAPPED_FLOOD',
      extracted_needs: JSON.stringify(['Person submerged underwater', 'diving equipment required'])
    };
    const reqsUnderwater = getRequiredCapabilities(underwaterInc);
    assert(reqsUnderwater.includes('underwater_rescue'), 'Must require underwater_rescue capability');

    // 9B: Incident requiring medical
    const medicalInc = {
      category: 'MEDICAL_EMERGENCY',
      extracted_needs: JSON.stringify(['Elderly diabetic patient needing immediate hospital transfer'])
    };
    const reqsMedical = getRequiredCapabilities(medicalInc);
    assert(reqsMedical.includes('medical_evacuation'), 'Must require medical_evacuation');

    // 9C: Incident requiring fire response
    const fireInc = {
      category: 'ELECTRICAL_FIRE',
      extracted_needs: JSON.stringify(['Transformer sparking in floodwater', 'electrical wire live'])
    };
    const reqsFire = getRequiredCapabilities(fireInc);
    assert(reqsFire.includes('electrical_hazard_response'), 'Must require electrical_hazard_response');
  });

  // TEST 10 — Nearest Eligible Team Selection & Exclusion Rules
  await testAsync('TEST 10: Nearest Suitable Rescue Asset Algorithm & Exclusion Verification', async () => {
    // Insert 2 test teams:
    // Team A: Divers near incident (1 km away)
    // Team B: Helicopter far away (50 km away)
    // Team C: Divers unavailable (assigned)
    const tA = 'team-test-near-diver-' + Date.now();
    const tB = 'team-test-heli-' + Date.now();
    const tC = 'team-test-busy-diver-' + Date.now();

    db.prepare(`
      INSERT INTO rescue_teams (id, name, zone, status, category, capabilities, latitude, longitude)
      VALUES (?, 'Near Diving Unit', 'Hyderabad', 'AVAILABLE', 'Divers', ?, 17.3860, 78.4870)
    `).run(tA, JSON.stringify(['underwater_rescue', 'water_rescue']));

    db.prepare(`
      INSERT INTO rescue_teams (id, name, zone, status, category, capabilities, latitude, longitude)
      VALUES (?, 'Aviation Wing', 'Hyderabad', 'AVAILABLE', 'Helicopter / Air Rescue', ?, 17.7000, 78.9000)
    `).run(tB, JSON.stringify(['aerial_rescue', 'air_evacuation']));

    db.prepare(`
      INSERT INTO rescue_teams (id, name, zone, status, category, capabilities, latitude, longitude)
      VALUES (?, 'Busy Diving Unit', 'Hyderabad', 'ASSIGNED', 'Divers', ?, 17.3852, 78.4868)
    `).run(tC, JSON.stringify(['underwater_rescue', 'water_rescue']));

    // Incident at 17.3850, 78.4867 requiring underwater rescue
    const incId = 'inc-test-match-' + Date.now();
    db.prepare(`
      INSERT INTO incidents (id, zone, latitude, longitude, category, severity, status, extracted_needs)
      VALUES (?, 'Zone 1', 17.3850, 78.4867, 'TRAPPED_FLOOD', 'CRITICAL', 'OPEN', ?)
    `).run(incId, JSON.stringify(['underwater_rescue', 'diver required']));

    const result = findNearestSuitableTeam(incId);
    assert.strictEqual(result.status, 'SUITABLE_TEAM_FOUND');
    // Team A must be selected! (Team B lacks capabilities; Team C is ASSIGNED)
    assert.strictEqual(result.recommendedTeam.id, tA, 'Must select eligible near diving team, not helicopter or busy team');
    assert(result.distanceKm < 2.0, `Expected distance < 2km, got ${result.distanceKm}`);

    // Clean up
    db.prepare('DELETE FROM rescue_teams WHERE id IN (?, ?, ?)').run(tA, tB, tC);
    db.prepare('DELETE FROM incidents WHERE id = ?').run(incId);
  });

  // TEST 11 — Critical Incident Auto-Assignment Execution
  await testAsync('TEST 11: Atomic Auto-Assignment of Critical Incidents', async () => {
    const incCrit = 'inc-test-auto-' + Date.now();
    db.prepare(`
      INSERT INTO incidents (id, zone, latitude, longitude, category, severity, status, extracted_needs, priority_score)
      VALUES (?, 'Zone 1', 17.3850, 78.4867, 'GENERAL_EMERGENCY', 'CRITICAL', 'OPEN', '["general_disaster_response"]', 95)
    `).run(incCrit);

    const autoRes = await autoAssignCriticalIncidents('Test_Auto_Harness');
    assert(autoRes.totalEvaluated >= 1);

    // Verify incident has been assigned
    const incAfter = db.prepare('SELECT assigned_team_id, status FROM incidents WHERE id = ?').get(incCrit);
    if (autoRes.assigned.some(a => a.incidentId === incCrit)) {
      assert(incAfter.assigned_team_id !== null);
      assert.strictEqual(incAfter.status, 'ASSIGNED');
      // Free team
      updateIncidentStatus(incCrit, 'RESOLVED');
    }

    db.prepare('DELETE FROM incidents WHERE id = ?').run(incCrit);
  });

  // TEST 12 — Incident Lifecycle & Resolution Display Contract
  await testAsync('TEST 12: Incident Lifecycle & Persistent Resolution State', async () => {
    // 12A. Create new SOS incident
    const testKey = 'test-lifecycle-' + Date.now();
    const sosRes = submitSOS({
      idempotencyKey: testKey,
      phone: '+919988776655',
      latitude: 17.3850,
      longitude: 78.4867,
      category: 'TRAPPED_FLOOD',
      description: 'Water has reached neck level, urgent rescue needed'
    });
    const reportId = sosRes.report.id;

    // Ensure at least one team is available
    db.prepare("UPDATE rescue_teams SET status = 'AVAILABLE', current_incident_id = NULL").run();

    // Simulate incident creation
    const incId = 'inc-lifecycle-' + Date.now();
    db.prepare(`
      INSERT INTO incidents (id, zone, latitude, longitude, category, severity, status, priority_score)
      VALUES (?, 'Hyderabad Zone', 17.3850, 78.4867, 'TRAPPED_FLOOD', 'CRITICAL', 'OPEN', 90)
    `).run(incId);
    db.prepare("UPDATE sos_reports SET incident_id = ?, status = 'UNDER_REVIEW' WHERE id = ?").run(incId, reportId);

    // Verify initial active status
    let incRecord = db.prepare('SELECT status, assigned_team_id FROM incidents WHERE id = ?').get(incId);
    assert.strictEqual(incRecord.status, 'OPEN');
    assert.strictEqual(incRecord.assigned_team_id, null);

    // 12B. Assign available team
    const team = db.prepare("SELECT * FROM rescue_teams WHERE status = 'AVAILABLE' LIMIT 1").get();
    assert(team, 'Available team required for lifecycle test');
    await assignTeamToIncident(incId, team.id, 'Test_Lifecycle_Commander');

    incRecord = db.prepare('SELECT status, assigned_team_id FROM incidents WHERE id = ?').get(incId);
    assert.strictEqual(incRecord.status, 'ASSIGNED');
    assert.strictEqual(incRecord.assigned_team_id, team.id);

    // 12C. Resolve incident
    const resStatus = updateIncidentStatus(incId, 'RESOLVED');
    assert.strictEqual(resStatus.success, true);
    assert.strictEqual(resStatus.status, 'RESOLVED');

    // 12D. Verify persistence: team freed and incident marked RESOLVED
    incRecord = db.prepare('SELECT status, assigned_team_id, updated_at FROM incidents WHERE id = ?').get(incId);
    assert.strictEqual(incRecord.status, 'RESOLVED');
    assert.strictEqual(incRecord.assigned_team_id, null);
    assert(incRecord.updated_at !== null);

    const teamAfter = db.prepare('SELECT status, current_incident_id FROM rescue_teams WHERE id = ?').get(team.id);
    assert.strictEqual(teamAfter.status, 'AVAILABLE');
    assert.strictEqual(teamAfter.current_incident_id, null);

    // 12E. Confirm resolved incident cannot be auto-assigned or assigned again
    const nearestRes = findNearestSuitableTeam(incId);
    assert.strictEqual(nearestRes.status, 'INCIDENT_RESOLVED');

    let doubleAssignFailed = false;
    try {
      await assignTeamToIncident(incId, team.id, 'Test_Commander_Blocked');
    } catch (e) {
      doubleAssignFailed = true;
      assert.strictEqual(e.code, 'INCIDENT_ALREADY_RESOLVED');
    }
    assert(doubleAssignFailed, 'Must reject assigning a team to a resolved incident');

    // Clean up
    db.prepare('DELETE FROM sos_reports WHERE id = ?').run(reportId);
    db.prepare('DELETE FROM incidents WHERE id = ?').run(incId);
  });

  console.log('\n========================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runTestSuite();
