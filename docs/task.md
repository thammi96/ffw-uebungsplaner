# Tasks - ffw-uebungsplaner Implementation

- `[x]` Setup project directories and initialize `package.json`
- `[x]` Configure environment file `.env` and `.env.example`
- `[x]` Setup SQLite Database & Schema (including audit logs table) in `src/db.js`
- `[x]` Implement Microsoft Entra ID & Local Debug Auth in `src/routes/auth.js`
- `[x]` Implement Public Routes (event view, phone check, registration, signup, web push subscription) in `src/routes/public.js`
- `[x]` Implement Admin Routes (dashboard, user approvals, event creation, signup list, audit logs, push notifications) in `src/routes/admin.js`
- `[x]` Setup Main Express Server in `src/server.js`
- `[x]` Design Sleek Frontend Views (Tailwind CSS, EJS)
  - `[x]` Main wrapper template (`src/views/layout.ejs` / header & footer partials)
  - `[x]` Public event details & signup form (`src/views/event.ejs`)
  - `[x]` Sleek login page (`src/views/login.ejs`)
  - `[x]` Admin dashboard (`src/views/admin.ejs`)
- `[x]` Setup PWA / Push Assets
  - `[x]` Web app manifest (`public/manifest.json`)
  - `[x]` Service Worker (`public/sw.js`)
  - `[x]` Client JS helper (`public/app.js`)
- `[x]` Setup Docker Configurations (`Dockerfile`, `docker-compose.yml`)
- `[x]` Verify application locally
