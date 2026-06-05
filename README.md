# ffw-uebungsplaner

Eine progressive Web-App (PWA) zur effizienten Termin- und Übungsplanung für Freiwillige Feuerwehren (speziell optimiert für Jugendfeuerwehren und die aktive Mannschaft).

---

## Kernfunktionen

- **Interaktive Übungsrückmeldung**: Mitglieder erhalten Übungslinks direkt per Messenger (z. B. WhatsApp) und können mit einem Klick Zu- oder Absagen abgeben.
- **Intelligente Vorschläge & Kommentare**: Dynamische Vorschläge passend zum Status (z. B. *„Bringe Kasten Bier mit“* bei Zusagen oder *„Arbeit / Spätschicht“* bei Absagen) erleichtern die Rückmeldung per Smartphone.
- **Admin-Freigabesystem**: Neue Rufnummern müssen einmalig durch Administratoren im Kontrollzentrum freigegeben werden, um Missbrauch zu verhindern.
- **PWA-Push-Nachrichten**: Web-Push-Erinnerungen direkt auf das Mobilgerät der Mitglieder vor anstehenden Übungen.
- **Microsoft Entra ID (Azure AD)**: Sicheres Log-in für Administratoren über Microsoft 365, steuerbar über Entra-Gruppenmitgliedschaften (inkl. lokalem Debug-Bypass).
- **Revisionssicheres System-Protokoll**: Lückenlose Audit-Protokollierung aller administrativen Vorgänge, Anmeldungen und Mitgliedschaftsfreigaben inklusive Zeitstempel und IP-Adressen.

---

## Technische Architektur

- **Backend**: Node.js (Express)
- **Datenbank**: SQLite via `better-sqlite3` (Datenbank wird bei Docker-Betrieb über ein Host-Volume persistent gespeichert)
- **Frontend**: EJS-Templates, gestylt mit responsivem Tailwind CSS für Smartphones und Tablets
- **Schnittstellen**: Web Push API, Microsoft Entra ID (MSAL Node Client)

---

## Erste Schritte (Lokal)

### Voraussetzungen
- [Node.js](https://nodejs.org/) (Version 18 oder neuer)

### Installation & Ausführung
1. Repository klonen:
   ```bash
   git clone https://github.com/thammi96/ffw-uebungsplaner.git
   cd ffw-uebungsplaner
   ```
2. Lokale Konfiguration erstellen:
   Kopiere die `.env.example` in eine neue Datei namens `.env` und passe ggf. Parameter an. Standardmäßig ist der lokale Debug-Bypass aktiv:
   ```bash
   cp .env.example .env
   ```
3. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
4. Entwicklungsserver starten:
   ```bash
   npm run dev
   ```
5. App im Browser öffnen:
   - Dashboard / Admin: `http://localhost:3000/admin` (über den Debug-Bypass anmelden)
   - Öffentlicher Übungslink: `http://localhost:3000/event/1` (sobald eine Übung angelegt ist)

---

## Deployment im Docker-Container

Die App ist für den Einsatz hinter einem Reverse-Proxy (z. B. Sophos Firewall / WAF) konzipiert. Der Proxy übernimmt die SSL-Terminierung (HTTPS), die App selbst läuft intern auf HTTP.

### Start per Docker Compose
1. Öffne die `docker-compose.yml` und trage deine Produktionsparameter ein (Entra ID Anmeldedaten, Admin Group ID, Host-Domain).
2. Setze `LOCAL_DEBUG_ADMIN=false` in der Compose-Datei, um den unbefugten lokalen Zugriff zu sperren.
3. Container im Hintergrund bauen und starten:
   ```bash
   docker compose up -d --build
   ```

Die SQLite-Datenbankdatei wird im benannten Docker-Volume `ffw-data` auf dem Ubuntu-Host persistent gespeichert.

---

## Ausführliche Dokumentation

Im Ordner [docs/](docs/) findest du detaillierte Projektdokumente:
- [Walkthrough der Verifikation und Testaufzeichnung](docs/walkthrough.md)
- [Technischer Implementierungsplan](docs/implementation_plan.md)
- [Taskliste und Entwicklungsstatus](docs/task.md)
