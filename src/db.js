const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Load environment variables if not loaded
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/database.sqlite';

// Ensure the directory for the database exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath, { verbose: console.log });
// Enable foreign keys
db.pragma('foreign_keys = ON');

// Database Migrations / Schema Initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    group_type TEXT CHECK(group_type IN ('JUGEND', 'AKTIVE', 'BEIDE')) NOT NULL,
    approved INTEGER DEFAULT 0 CHECK(approved IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL, -- Format: YYYY-MM-DDTHH:MM
    target_group TEXT CHECK(target_group IN ('JUGEND', 'AKTIVE', 'ALLE')) NOT NULL,
    reminder_1_minutes INTEGER DEFAULT 1440,
    reminder_2_minutes INTEGER DEFAULT 60,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('ZUSAGE', 'ABSAGE')) NOT NULL,
    comment TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

// Pre-fill default settings
db.exec(`
  INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name', 'Feuerwehr Übungsplaner');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('app_subtitle', 'Freiwillige Feuerwehr');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('push_title_template', 'Terminerinnerung: {title}');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('push_body_template', 'Nächste Übung am {date}. Bitte gib Rückmeldung.');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('suggestions_zusage', 'Bringe Kasten Bier mit, Bringe Cola mit, Fahre als Fahrer, Bringe Grillkohle mit, Direkt vom Dienst');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('suggestions_absage', 'Privater Geburtstag, Spätschicht / Arbeit, Krankheit, Urlaub, Schule / Klausur');
`);

const webpush = require('web-push');

/**
 * Log an action to the audit logs table.
 * @param {number|null} userId 
 * @param {string|null} userName 
 * @param {string} action 
 * @param {string} details 
 * @param {string} ip 
 */
function logAudit(userId, userName, action, details, ip) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId || null, userName || null, action, details, ip || null);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

// Check and configure VAPID Keys for Web Push
let publicVapidKey = process.env.VAPID_PUBLIC_KEY;
let privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (!publicVapidKey || !privateVapidKey) {
  const pubRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('vapid_public_key');
  const privRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('vapid_private_key');
  if (pubRow && privRow) {
    publicVapidKey = pubRow.value;
    privateVapidKey = privRow.value;
  } else {
    try {
      const keys = webpush.generateVAPIDKeys();
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('vapid_public_key', keys.publicKey);
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('vapid_private_key', keys.privateKey);
      publicVapidKey = keys.publicKey;
      privateVapidKey = keys.privateKey;
      console.log('Automatically generated and saved VAPID keys in settings table.');
    } catch (err) {
      console.error('Failed to generate or save VAPID keys:', err);
    }
  }
}

if (publicVapidKey && privateVapidKey) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@ffw-uebungsplaner.local',
      publicVapidKey,
      privateVapidKey
    );
  } catch (err) {
    console.error('Failed to set VAPID details:', err);
  }
} else {
  console.error('Web Push VAPID keys are missing or invalid.');
}

module.exports = {
  db,
  logAudit,
  publicVapidKey,
  privateVapidKey,
  webpush
};
