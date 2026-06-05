const express = require('express');
const { db, logAudit, publicVapidKey } = require('../db');

const router = express.Router();

// Helper to normalize phone numbers
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)]/g, '');
}

// GET /event/:id
router.get('/event/:id', (req, res) => {
  const eventId = req.params.id;
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).send('Übung nicht gefunden.');
    }

    res.render('event', {
      event,
      publicVapidKey
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).send('Serverfehler beim Laden der Übung.');
  }
});

// GET /event/:id/ics (Server-side ICS for mobile/desktop native calendar integration)
router.get('/event/:id/ics', (req, res) => {
  const eventId = req.params.id;
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).send('Übung nicht gefunden.');
    }

    const date = new Date(event.event_date);
    const endDate = new Date(date.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration

    function formatICSDate(d) {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    const startFormatted = formatICSDate(date);
    const endFormatted = formatICSDate(endDate);

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FFW Uebungsplaner//Calendar Event//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${event.id}-${Date.now()}@ffw-uebungsplaner.local`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${startFormatted}`,
      `DTEND:${endFormatted}`,
      `SUMMARY:${event.title.replace(/[,;]/g, '\\$&')}`,
      `DESCRIPTION:${(event.description || '').replace(/[\r\n]+/g, '\\n').replace(/[,;]/g, '\\$&')}`,
      'LOCATION:Feuerwehrgerätehaus',
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const icsContent = icsLines.join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="event_${event.id}.ics"`);
    res.send(icsContent);
  } catch (error) {
    console.error('Error generating ICS:', error);
    res.status(500).send('Serverfehler bei der Generierung der Kalenderdatei.');
  }
});

// POST /event/:id/check-phone
router.post('/event/:id/check-phone', (req, res) => {
  const eventId = req.params.id;
  const rawPhone = req.body.phone_number;
  const phone = normalizePhone(rawPhone);

  if (!phone) {
    return res.status(400).json({ error: 'Telefonnummer ist erforderlich.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE phone_number = ?').get(phone);

    if (!user) {
      return res.json({ status: 'not_found' });
    }

    if (user.approved === 0) {
      return res.json({ status: 'pending', name: user.name });
    }

    // Check if user already signed up for this event
    const signup = db.prepare('SELECT * FROM signups WHERE event_id = ? AND user_id = ?').get(eventId, user.id);

    return res.json({
      status: 'approved',
      user: {
        id: user.id,
        name: user.name,
        group_type: user.group_type
      },
      signup: signup || null
    });
  } catch (error) {
    console.error('Error checking phone number:', error);
    res.status(500).json({ error: 'Datenbankfehler.' });
  }
});

// POST /event/:id/register
router.post('/event/:id/register', (req, res) => {
  const { name, phone_number, group_type } = req.body;
  const phone = normalizePhone(phone_number);

  if (!name || !phone || !group_type) {
    return res.status(400).json({ error: 'Name, Telefonnummer und Abteilung sind erforderlich.' });
  }

  try {
    // Check if already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE phone_number = ?').get(phone);
    if (existingUser) {
      return res.status(400).json({ error: 'Diese Telefonnummer ist bereits registriert.' });
    }

    const stmt = db.prepare(`
      INSERT INTO users (name, phone_number, group_type, approved)
      VALUES (?, ?, ?, 0)
    `);
    const info = stmt.run(name, phone, group_type);

    logAudit(
      info.lastInsertRowid,
      name,
      'USER_REGISTER',
      `Registrierungsanfrage für neue Telefonnummer ${phone} (Abteilung: ${group_type})`,
      req.ip
    );

    res.json({ status: 'pending' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Datenbankfehler bei der Registrierung.' });
  }
});

// POST /event/:id/signup
router.post('/event/:id/signup', (req, res) => {
  const eventId = req.params.id;
  const { phone_number, status, comment } = req.body;
  const phone = normalizePhone(phone_number);

  if (!phone || !status) {
    return res.status(400).json({ error: 'Telefonnummer und Status (Zusage/Absage) sind erforderlich.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE phone_number = ?').get(phone);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    if (user.approved === 0) {
      return res.status(403).json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' });
    }

    // Insert or update signup
    const stmt = db.prepare(`
      INSERT INTO signups (event_id, user_id, status, comment, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(event_id, user_id) 
      DO UPDATE SET status = excluded.status, comment = excluded.comment, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(eventId, user.id, status, comment || null);

    logAudit(
      user.id,
      user.name,
      'USER_SIGNUP',
      `Rückmeldung für Übung ID ${eventId}: ${status} (${comment || 'kein Kommentar'})`,
      req.ip
    );

    res.json({ status: 'success', userId: user.id });
  } catch (error) {
    console.error('Error submitting signup:', error);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Rückmeldung.' });
  }
});

// POST /push/subscribe
router.post('/push/subscribe', (req, res) => {
  const { userId, subscription } = req.body;

  if (!userId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Ungültige Push-Subscription Daten.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    const auth = subscription.keys ? subscription.keys.auth : '';
    const p256dh = subscription.keys ? subscription.keys.p256dh : '';

    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint)
      DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
    `);
    stmt.run(userId, subscription.endpoint, p256dh, auth);

    logAudit(
      userId,
      user.name,
      'PUSH_SUBSCRIBE',
      `Push-Erinnerungen für Gerät aktiviert (Endpoint: ${subscription.endpoint.substring(0, 40)}...)`,
      req.ip
    );

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Datenbankfehler beim Aktivieren der Push-Benachrichtigungen.' });
  }
});

module.exports = router;
