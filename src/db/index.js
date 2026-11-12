const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DATABASE_URL || path.join(dbDir, 'alertnet.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    -- Citizens table
    CREATE TABLE IF NOT EXISTS citizens (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      name TEXT,
      preferred_lang TEXT DEFAULT 'en',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- SOS Reports (Citizens' raw inputs)
    CREATE TABLE IF NOT EXISTS sos_reports (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      citizen_id TEXT,
      phone TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address_text TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      affected_people INTEGER DEFAULT 1,
      vulnerable_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'RECEIVED', -- PENDING_SYNC, RECEIVED, UNDER_REVIEW, TEAM_ASSIGNED, TEAM_EN_ROUTE, RESOLVED
      incident_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES citizens(id)
    );

    -- Transactional Outbox for 100% durable event publishing
    CREATE TABLE IF NOT EXISTS outbox_events (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      published INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME
    );

    -- Incidents (Aggregated from SOS reports)
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      zone TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address_hint TEXT,
      category TEXT NOT NULL,
      severity TEXT DEFAULT 'URGENT', -- CRITICAL, URGENT, INFORMATIONAL
      priority_score REAL DEFAULT 50.0,
      report_count INTEGER DEFAULT 1,
      extracted_needs TEXT, -- JSON array
      ai_explanation TEXT,
      ai_confidence REAL,
      ai_method TEXT DEFAULT 'RULE_BASED',
      is_manual_override INTEGER DEFAULT 0,
      status TEXT DEFAULT 'OPEN', -- OPEN, ASSIGNED, RESOLVED
      assigned_team_id TEXT UNIQUE, -- UNIQUE ensures a team is assigned to at most ONE active incident!
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Rescue Teams
    CREATE TABLE IF NOT EXISTS rescue_teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      leader_name TEXT,
      phone TEXT,
      zone TEXT NOT NULL,
      status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, ASSIGNED, EN_ROUTE, ON_SCENE, RESTING
      current_incident_id TEXT,
      capacity INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (current_incident_id) REFERENCES incidents(id)
    );

    -- Broadcast Alerts
    CREATE TABLE IF NOT EXISTS alert_campaigns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message_en TEXT NOT NULL,
      message_hi TEXT,
      message_te TEXT,
      zone TEXT NOT NULL,
      severity TEXT NOT NULL,
      total_residents INTEGER DEFAULT 0,
      sms_count INTEGER DEFAULT 0,
      push_count INTEGER DEFAULT 0,
      email_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'CREATED', -- CREATED, DISPATCHING, COMPLETED, PARTIAL_FAILURE
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Channel Delivery Logs
    CREATE TABLE IF NOT EXISTS channel_deliveries (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      resident_id TEXT NOT NULL,
      channel TEXT NOT NULL, -- SMS, PUSH, EMAIL
      status TEXT DEFAULT 'PENDING', -- PENDING, DELIVERED, RETRYING, DEAD_LETTER
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      delivered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, resident_id, channel) -- Prevents duplicate deliveries per resident per channel!
    );

    -- Synthetic Residents (for 100k broadcast test)
    CREATE TABLE IF NOT EXISTS residents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      push_token TEXT,
      zone TEXT NOT NULL,
      language TEXT DEFAULT 'en'
    );
  `);

  // Seed initial rescue teams if empty
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM rescue_teams').get().count;
  if (teamCount === 0) {
    const insertTeam = db.prepare(`
      INSERT INTO rescue_teams (id, name, leader_name, phone, zone, status, capacity)
      VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?)
    `);

    const teams = [
      ['team-hyd-01', 'NDRF Alpha 1', 'Capt. R. Sharma', '+91 98765 00001', 'Hyderabad Central', 15],
      ['team-hyd-02', 'SDRF Bravo 2', 'Insp. K. Rao', '+91 98765 00002', 'Hyderabad South', 12],
      ['team-hyd-03', 'GHMC Quick Response 3', 'Eng. M. Patel', '+91 98765 00003', 'Hyderabad East', 10],
      ['team-hyd-04', 'Indian Navy Marine Commando', 'Lt. Cdr. V. Reddy', '+91 98765 00004', 'Hyderabad West', 20],
      ['team-hyd-05', 'Civil Defence Volunteers', 'S. Meena', '+91 98765 00005', 'Hyderabad North', 8],
      ['team-vjy-01', 'AP Disaster Response 1', 'Cmdt. A. Kumar', '+91 98765 00006', 'Vijayawada Krishna', 15],
      ['team-vjy-02', 'Coast Guard Inshore Patrol', 'Sub Lt. B. Naidu', '+91 98765 00007', 'Vijayawada Flood Zone', 18]
    ];

    const seedTx = db.transaction(() => {
      for (const t of teams) {
        insertTeam.run(...t);
      }
    });
    seedTx();
  }
}

initSchema();

module.exports = {
  db,
  initSchema
};
