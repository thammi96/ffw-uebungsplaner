# Implementation Plan - ffw-uebungsplaner

PWA (Progressive Web App) for volunteer fire departments ("Freiwillige Feuerwehr") to plan drills/exercises, track attendance (signups), and send push notification reminders.

---

## User Review Required

> [!IMPORTANT]
> **User Approval & Setup Actions:**
> 1. **Microsoft Entra ID:** You must register an app in Microsoft Entra (Azure AD) and retrieve Client ID, Client Secret, Tenant ID, and the Admin Group ID. For local testing, we provide a `LOCAL_DEBUG_ADMIN` mode that bypasses Entra login completely.
> 2. **VAPID Keys:** For PWA push notifications, you need public/private VAPID keys. We will provide a quick generator script or automatically generate them on the first server start if they are not configured.

---

## Open Questions

> [!NOTE]
> None at the moment. The user specifications are precise. We have designed the approval flow so that a user registering with their phone number for the first time is marked as `approved = 0` (pending) and cannot view/interact with signups until an Admin approves them in the Admin panel.

---

## Proposed Changes

We will create a new Node.js workspace in `C:\Users\Marco\.gemini\antigravity-ide\scratch\ffw-uebungsplaner`.

### Backend Components

#### [NEW] [package.json](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/package.json)
- Define dependencies: `express`, `better-sqlite3`, `dotenv`, `ejs`, `web-push`, `express-session`, `@azure/msal-node`, `cookie-parser`.

#### [NEW] [.env.example](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/.env.example)
- Environment variable template (PORT, DB_PATH, VAPID keys, Entra credentials, Local Debug settings).

#### [NEW] [src/db.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/db.js)
- Initialize SQLite via `better-sqlite3`.
- Auto-run migrations to create `users`, `events`, `signups`, `push_subscriptions`, and `audit_logs` tables.
- `audit_logs` table schema: `id` (PK), `user_id` (nullable FK), `action` (TEXT), `details` (TEXT), `ip_address` (TEXT), `created_at` (DATETIME).
- Add helper functions to log system and user audits.

#### [NEW] [src/routes/auth.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/routes/auth.js)
- Handle Microsoft Entra ID OAuth flow.
- Fallback route for `LOCAL_DEBUG_ADMIN` bypass.
- Group-based access verification using the Microsoft Graph API token claims (or querying Graph API if group claim is not standard in token).

#### [NEW] [src/routes/admin.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/routes/admin.js)
- Admin Dashboard:
  - List and create events.
  - List registered users.
  - Approve pending user registrations (`approved = 0` to `1`).
  - View event signups (Zusage/Absage statistics, free-text comments).
  - Manual trigger for sending push notifications for an event.

#### [NEW] [src/routes/public.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/routes/public.js)
- Main user flow:
  - GET `/event/:id` -> Show event details.
  - POST `/event/:id/check-phone` -> Verify if phone exists and is approved. If not exists, allow registration.
  - POST `/event/:id/register` -> Register a new phone number (`approved = 0`).
  - POST `/event/:id/signup` -> Save or update signup status and comments.
  - POST `/push/subscribe` -> Store web push subscriptions mapped to users.

#### [NEW] [src/server.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/server.js)
- Initialize Express, sessions, body-parsers, session state, static folder, routes, and error handlers.

---

### Frontend Components (Views & Assets)

#### [NEW] [src/views/layout.ejs](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/views/layout.ejs)
- Core HTML wrapper with Tailwind CSS CDN, custom Google font, meta tags for PWA, and basic header/footer.

#### [NEW] [src/views/event.ejs](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/views/event.ejs)
- Event view, phone check form, signup form with comments, suggestion options based on Zusage/Absage, and push notification subscription button.

#### [NEW] [src/views/admin.ejs](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/views/admin.ejs)
- Admin layout featuring event creation, pending user approval list, user directory, and signup tables.

#### [NEW] [src/views/login.ejs](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/src/views/login.ejs)
- Sleek login page with two buttons: "Mit Microsoft 365 anmelden" and "Local Debug Mode (Bypass)" (only visible if `LOCAL_DEBUG_ADMIN` is true).

#### [NEW] [public/manifest.json](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/public/manifest.json)
- PWA manifest specifying theme color, icons, start URL, and standalone display.

#### [NEW] [public/sw.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/public/sw.js)
- Service Worker script to handle push events, show notification popups, and handle notification clicks.

#### [NEW] [public/app.js](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/public/app.js)
- Client-side helper scripts for PWA installation prompting, push subscription requests, and visual UI interactions.

---

### Docker & Deployment

#### [NEW] [Dockerfile](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/Dockerfile)
- Node production container using `node:18-alpine` (building dependencies like `better-sqlite3` requires some build tools, or we can use a debian-slim image to avoid compilation issues with node-gyp on alpine). Let's use `node:18-bullseye-slim` for smooth `better-sqlite3` installation.

#### [NEW] [docker-compose.yml](file:///C:/Users/Marco/.gemini/antigravity-ide/scratch/ffw-uebungsplaner/docker-compose.yml)
- Sets up node container mapping `/app/data` to a Docker volume `ffw-data` (storing the SQLite DB), exposes port 3001, and specifies environment variables.

---

## Verification Plan

### Automated Tests
- Syntax and lint checks via Node runtime.
- Verify sqlite schema creation by running the server code locally.

### Manual Verification
1. Boot server in `LOCAL_DEBUG_ADMIN` mode.
2. Open browser, login via bypass, create an Event.
3. Open Event URL `/event/1`.
4. Enter non-existent phone number, submit registration, check that user goes to pending status.
5. In Admin view, approve user.
6. Refresh Event page, check phone number, fill out signup form with Zusage/Absage + comments.
7. Verify signups count and data in Admin dashboard.
8. Verify Push subscription registration flow.
