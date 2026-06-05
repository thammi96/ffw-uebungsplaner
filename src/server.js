const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Ensure DB is initialized
const { db, logAudit } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy (Sophos WAF)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Sessions configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'ffw-uebungsplaner-local-secret-key-12345',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Internal HTTP behind Sophos proxy
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Set EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Dynamic PWA Manifest and Logo Assets Route (persistent via SQLite)
app.get('/manifest.json', (req, res) => {
  try {
    const manifest = {
      "name": "FFW Planer",
      "short_name": "FFW Planer",
      "description": "Termin- und Übungsplanung für Jugendfeuerwehr und aktive Mannschaft",
      "start_url": "/",
      "scope": "/",
      "display": "standalone",
      "background_color": "#f8fafc",
      "theme_color": "#dc2626",
      "orientation": "portrait-primary",
      "icons": [
        {
          "src": "/logo-192.png",
          "type": "image/png",
          "sizes": "192x192",
          "purpose": "any maskable"
        },
        {
          "src": "/logo-512.png",
          "type": "image/png",
          "sizes": "512x512",
          "purpose": "any maskable"
        }
      ]
    };
    res.json(manifest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Manifestfehler' });
  }
});

app.get(['/logo-192.png', '/logo-512.png'], (req, res) => {
  try {
    const logoRow = db.prepare("SELECT value FROM settings WHERE key = 'custom_logo_base64'").get();
    if (logoRow && logoRow.value) {
      const imgBuffer = Buffer.from(logoRow.value, 'base64');
      res.type('image/png');
      return res.send(imgBuffer);
    }
  } catch (err) {
    console.error('Error loading custom logo:', err);
  }
  res.sendFile(path.join(__dirname, '../public/logo-192.png'));
});

app.get('/favicon.ico', (req, res) => {
  try {
    const logoRow = db.prepare("SELECT value FROM settings WHERE key = 'custom_logo_base64'").get();
    if (logoRow && logoRow.value) {
      const imgBuffer = Buffer.from(logoRow.value, 'base64');
      res.type('image/png');
      return res.send(imgBuffer);
    }
  } catch (err) {
    console.error('Error loading custom favicon:', err);
  }
  res.sendFile(path.join(__dirname, '../public/logo-192.png'));
});

// Serve Static Files
app.use(express.static(path.join(__dirname, '../public')));

// Log requests helper for system tracking
app.use((req, res, next) => {
  // Exclude assets
  if (!req.path.startsWith('/css') && !req.path.startsWith('/js') && !req.path.includes('.')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  }
  next();
});

// Load app settings dynamically for all EJS views
app.use((req, res, next) => {
  try {
    const nameRow = db.prepare("SELECT value FROM settings WHERE key = 'app_name'").get();
    const subRow = db.prepare("SELECT value FROM settings WHERE key = 'app_subtitle'").get();
    const zusageRow = db.prepare("SELECT value FROM settings WHERE key = 'suggestions_zusage'").get();
    const absageRow = db.prepare("SELECT value FROM settings WHERE key = 'suggestions_absage'").get();
    
    res.locals.appName = nameRow ? nameRow.value : 'Feuerwehr Übungsplaner';
    res.locals.appSubtitle = subRow ? subRow.value : 'Freiwillige Feuerwehr';
    res.locals.suggestionsZusage = zusageRow ? zusageRow.value : '';
    res.locals.suggestionsAbsage = absageRow ? absageRow.value : '';
  } catch (err) {
    res.locals.appName = 'Feuerwehr Übungsplaner';
    res.locals.appSubtitle = 'Freiwillige Feuerwehr';
    res.locals.suggestionsZusage = '';
    res.locals.suggestionsAbsage = '';
  }
  next();
});

// Import routers
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const publicRouter = require('./routes/public');

// Mount routes
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/', publicRouter);

// Root path: public events overview (PWA start page)
app.get('/', (req, res) => {
  try {
    const allEvents = db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM signups s WHERE s.event_id = e.id AND s.status = 'ZUSAGE') as yes_count,
        (SELECT COUNT(*) FROM signups s WHERE s.event_id = e.id AND s.status = 'ABSAGE') as no_count
      FROM events e
      ORDER BY e.event_date ASC
    `).all();

    const now = new Date();
    const events = allEvents.filter(e => new Date(e.event_date) >= now);

    events.forEach(e => {
      const d = new Date(e.event_date);
      e.formatted_date = d.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const diffMs = d - now;
      e.days_until = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    });

    res.render('index', { events });
  } catch (err) {
    console.error('Error loading homepage:', err);
    res.status(500).send('Serverfehler.');
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Seite nicht gefunden.');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).send('Interner Serverfehler.');
});

// Start listening
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` Feuerwehr Übungsplaner PWA gestartet!`);
  console.log(` Server läuft auf Port: ${PORT}`);
  console.log(` Modus: ${process.env.LOCAL_DEBUG_ADMIN === 'true' ? 'DEBUG (Lokaler Bypass aktiv)' : 'PROD (Entra ID)'}`);
  console.log(`========================================`);
});
