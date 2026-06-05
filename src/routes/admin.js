const express = require('express');
const { db, logAudit, webpush } = require('../db');
const multer = require('multer');

const router = express.Router();
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 } // limit to 2MB
});

// Middleware to protect admin routes
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/auth/login-view');
  }
  next();
}

// Apply admin protection
router.use(requireAdmin);

// Helper to format date for local display
function formatGermanDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// GET /admin
router.get('/', (req, res) => {
  const admin = req.session.admin;
  try {
    // 1. Fetch events with attendance statistics
    const events = db.prepare(`
      SELECT e.*, 
             (SELECT COUNT(*) FROM signups s WHERE s.event_id = e.id AND s.status = 'ZUSAGE') as yes_count,
             (SELECT COUNT(*) FROM signups s WHERE s.event_id = e.id AND s.status = 'ABSAGE') as no_count
      FROM events e
      ORDER BY e.event_date ASC
    `).all();

    // Format dates for template
    events.forEach(e => {
      e.formatted_date = formatGermanDate(e.event_date);
    });

    // 2. Fetch pending users
    const pendingUsers = db.prepare('SELECT * FROM users WHERE approved = 0 ORDER BY created_at DESC').all();

    // 3. Fetch approved users
    const approvedUsers = db.prepare('SELECT * FROM users WHERE approved = 1 ORDER BY name ASC').all();

    // 4. Fetch audit logs (limit 50)
    const auditLogs = db.prepare(`
      SELECT * FROM audit_logs 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();

    auditLogs.forEach(log => {
      log.formatted_date = formatGermanDate(log.created_at);
    });

    // 5. Fetch details for each event (all signups per event)
    const eventSignups = {};
    for (const e of events) {
      const signups = db.prepare(`
        SELECT s.*, u.name, u.phone_number
        FROM signups s
        JOIN users u ON s.user_id = u.id
        WHERE s.event_id = ?
        ORDER BY u.name ASC
      `).all(e.id);
      eventSignups[e.id] = signups;
    }

    // 6. Fetch settings
    const settingsRows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    res.render('admin', {
      admin,
      events,
      pendingUsers,
      approvedUsers,
      auditLogs,
      eventSignups,
      settings
    });
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    res.status(500).send('Fehler beim Laden des Admin-Dashboards.');
  }
});

// POST /admin/event/new
router.post('/event/new', (req, res) => {
  const admin = req.session.admin;
  const { title, description, event_date, target_group, reminder_1_minutes, reminder_2_minutes } = req.body;

  if (!title || !event_date || !target_group) {
    return res.status(400).send('Titel, Datum und Zielgruppe sind erforderlich.');
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO events (title, description, event_date, target_group, reminder_1_minutes, reminder_2_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      title,
      description || null,
      event_date,
      target_group,
      parseInt(reminder_1_minutes) || 1440,
      parseInt(reminder_2_minutes) || 60
    );

    logAudit(
      null,
      admin.name,
      'EVENT_CREATE',
      `Übung '${title}' (ID: ${info.lastInsertRowid}) am ${formatGermanDate(event_date)} erstellt für Zielgruppe ${target_group}`,
      req.ip
    );

    res.redirect('/admin');
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).send('Fehler beim Erstellen der Übung.');
  }
});

// POST /admin/event/:id/delete
router.post('/event/:id/delete', (req, res) => {
  const admin = req.session.admin;
  const eventId = req.params.id;

  try {
    // Get event title first for audit log
    const event = db.prepare('SELECT title FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).send('Übung nicht gefunden.');
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(eventId);

    logAudit(
      null,
      admin.name,
      'EVENT_DELETE',
      `Übung '${event.title}' (ID: ${eventId}) gelöscht.`,
      req.ip
    );

    res.redirect('/admin');
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).send('Fehler beim Löschen der Übung.');
  }
});

// POST /admin/user/:id/approve
router.post('/user/:id/approve', (req, res) => {
  const admin = req.session.admin;
  const userId = req.params.id;

  try {
    const user = db.prepare('SELECT name, phone_number FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).send('Benutzer nicht gefunden.');
    }

    db.prepare('UPDATE users SET approved = 1 WHERE id = ?').run(userId);

    logAudit(
      null,
      admin.name,
      'USER_APPROVE',
      `Mitglied '${user.name}' (${user.phone_number}) freigegeben.`,
      req.ip
    );

    res.redirect('/admin');
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).send('Fehler beim Freigeben des Benutzers.');
  }
});

// POST /admin/user/:id/delete
router.post('/user/:id/delete', (req, res) => {
  const admin = req.session.admin;
  const userId = req.params.id;

  try {
    const user = db.prepare('SELECT name, phone_number FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).send('Benutzer nicht gefunden.');
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    logAudit(
      null,
      admin.name,
      'USER_DELETE',
      `Mitglied '${user.name}' (${user.phone_number}) gelöscht.`,
      req.ip
    );

    res.redirect('/admin');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Fehler beim Löschen des Benutzers.');
  }
});

// POST /admin/event/:id/send-reminders
router.post('/event/:id/send-reminders', async (req, res) => {
  const admin = req.session.admin;
  const eventId = req.params.id;

  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).send('Übung nicht gefunden.');
    }

    // Get matching subscriptions
    // Event Target: JUGEND -> users: JUGEND, BEIDE
    // Event Target: AKTIVE -> users: AKTIVE, BEIDE
    // Event Target: ALLE -> users: JUGEND, AKTIVE, BEIDE
    const subscriptions = db.prepare(`
      SELECT ps.*, u.name, u.id as u_id
      FROM push_subscriptions ps
      JOIN users u ON ps.user_id = u.id
      WHERE u.approved = 1 AND (
        ? = 'ALLE'
        OR (? = 'JUGEND' AND u.group_type IN ('JUGEND', 'BEIDE'))
        OR (? = 'AKTIVE' AND u.group_type IN ('AKTIVE', 'BEIDE'))
      )
    `).all(event.target_group, event.target_group, event.target_group);

    // Load push templates
    const titleRow = db.prepare("SELECT value FROM settings WHERE key = 'push_title_template'").get();
    const bodyRow = db.prepare("SELECT value FROM settings WHERE key = 'push_body_template'").get();
    const titleTpl = titleRow ? titleRow.value : 'Terminerinnerung: {title}';
    const bodyTpl = bodyRow ? bodyRow.value : 'Nächste Übung am {date}. Bitte gib Rückmeldung.';

    const formattedDate = formatGermanDate(event.event_date);
    const pushTitle = titleTpl.replace(/{title}/g, event.title).replace(/{date}/g, formattedDate);
    const pushBody = bodyTpl.replace(/{title}/g, event.title).replace(/{date}/g, formattedDate);

    const payload = JSON.stringify({
      title: pushTitle,
      body: pushBody,
      url: `/event/${event.id}`
    });

    let successCount = 0;
    let failCount = 0;

    const promises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        successCount++;
      } catch (err) {
        failCount++;
        // If expired or gone (410, 404), clean up subscription
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
        console.error(`Failed push to ${sub.name} (user ID ${sub.u_id}):`, err.statusCode || err);
      }
    });

    await Promise.all(promises);

    logAudit(
      null,
      admin.name,
      'PUSH_SEND',
      `Erinnerungen für Übung '${event.title}' (ID: ${event.id}) gesendet. Erfolgreich: ${successCount}, Fehlgeschlagen: ${failCount}`,
      req.ip
    );

    res.redirect('/admin');
  } catch (error) {
    console.error('Error triggering push notifications:', error);
    res.status(500).send('Fehler beim Senden der Push-Nachrichten.');
  }
});

// POST /admin/settings/save
router.post('/settings/save', (req, res) => {
  const admin = req.session.admin;
  const { app_name, app_subtitle, push_title_template, push_body_template, suggestions_zusage, suggestions_absage } = req.body;

  if (!app_name || !app_subtitle) {
    return res.status(400).send('Name der App und Unterüberschrift sind erforderlich.');
  }

  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run('app_name', app_name);
    stmt.run('app_subtitle', app_subtitle);
    stmt.run('push_title_template', push_title_template || 'Terminerinnerung: {title}');
    stmt.run('push_body_template', push_body_template || 'Nächste Übung am {date}. Bitte gib Rückmeldung.');
    stmt.run('suggestions_zusage', suggestions_zusage || '');
    stmt.run('suggestions_absage', suggestions_absage || '');

    logAudit(
      null,
      admin.name,
      'SETTINGS_SAVE',
      `Globale Einstellungen aktualisiert (Titel: ${app_name})`,
      req.ip
    );

    res.redirect('/admin#settings');
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).send('Fehler beim Speichern der Einstellungen.');
  }
});

// POST /admin/settings/upload-logo
router.post('/settings/upload-logo', upload.single('logo'), (req, res) => {
  const admin = req.session.admin;
  
  if (!req.file) {
    return res.status(400).send('Keine Datei hochgeladen.');
  }

  // Ensure it's an image
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).send('Nur Bilddateien sind erlaubt.');
  }

  try {
    const base64 = req.file.buffer.toString('base64');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_logo_base64', ?)").run(base64);

    logAudit(
      null,
      admin.name,
      'SETTINGS_LOGO_UPLOAD',
      `Neues App-Logo/Icon hochgeladen (${req.file.originalname})`,
      req.ip
    );

    res.redirect('/admin#settings');
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).send('Fehler beim Hochladen des Logos.');
  }
});

// POST /admin/settings/reset-logo
router.post('/settings/reset-logo', (req, res) => {
  const admin = req.session.admin;

  try {
    db.prepare("DELETE FROM settings WHERE key = 'custom_logo_base64'").run();

    logAudit(
      null,
      admin.name,
      'SETTINGS_LOGO_RESET',
      `App-Logo auf Standard zurückgesetzt.`,
      req.ip
    );

    res.redirect('/admin#settings');
  } catch (error) {
    console.error('Error resetting logo:', error);
    res.status(500).send('Fehler beim Zurücksetzen des Logos.');
  }
});

module.exports = router;
