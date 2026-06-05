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
   - Dashboard / Admin: `http://localhost:3001/admin` (über den Debug-Bypass anmelden)
   - Öffentlicher Übungslink: `http://localhost:3001/event/1` (sobald eine Übung angelegt ist)

---

## Deployment im Docker-Container

Die App ist für den Einsatz hinter einem Reverse-Proxy (z. B. Sophos Firewall / WAF) konzipiert. Der Proxy übernimmt die SSL-Terminierung (HTTPS), die App selbst läuft intern auf HTTP auf Port 3001.

### Start per Docker Compose
1. Kopiere die Datei `.env.example` auf deinem Server in eine neue Datei namens `.env`:
   ```bash
   cp .env.example .env
   ```
2. Trage deine Produktionsparameter (Entra-Verbindung, VAPID-Schlüssel usw.) in der `.env`-Datei ein.
3. Setze `LOCAL_DEBUG_ADMIN=false` in der `.env`-Datei, um den unbefugten lokalen Zugriff zu sperren.
4. Container im Hintergrund bauen und starten:
   ```bash
   docker compose up -d --build
   ```

Die SQLite-Datenbankdatei wird im benannten Docker-Volume `ffw-data` auf dem Ubuntu-Host persistent gespeichert.

---

## Microsoft Entra ID (Azure AD) Konfiguration

Um das Admin-Dashboard mit Microsoft 365 Entra ID abzusichern, folge dieser Konfigurationsanleitung:

1. **Microsoft Entra Admin Center öffnen**:
   Melde dich im [Entra Admin Center](https://entra.microsoft.com/) an und navigiere zu **Identität** > **Anwendungen** > **App-Registrierungen**.
   
2. **App-Registrierung anlegen**:
   - Klicke auf **Neue Registrierung**.
   - **Name**: `ffw-uebungsplaner`
   - **Unterstützte Kontotypen**: *Nur Konten in diesem Organisationsverzeichnis (Einzelner Mandant)*.
   - **Umleitungs-URI (Redirect URI)**: Plattform **Web** auswählen.
     - Für lokales Testen: `http://localhost:3001/auth/callback`
     - Für die Server-Bereitstellung: `https://deine-domain.de/auth/callback` *(Muss HTTPS sein!)*
   - Klicke auf **Registrieren**.

3. **IDs sichern**:
   - Kopiere die **Anwendungs-ID (Client-ID)** und trage sie in `.env` oder `docker-compose.yml` als `ENTRA_CLIENT_ID` ein.
   - Kopiere die **Verzeichnis-ID (Mandanten-ID / Tenant-ID)** und trage sie als `ENTRA_TENANT_ID` ein.

4. **Client-Geheimnis (Client Secret) generieren**:
   - Navigiere zu **Zertifikate & Geheimnisse** > **Neues Clientgeheimnis**.
   - Trage eine Beschreibung ein und wähle die Gültigkeitsdauer.
   - Klicke auf **Hinzufügen** und kopiere **sofort** den **Wert (Value)** (nicht die Geheimnis-ID!). Trage diesen Wert als `ENTRA_CLIENT_SECRET` ein.

5. **API-Berechtigungen hinzufügen**:
   - Navigiere zu **API-Berechtigungen** > **Berechtigung hinzufügen**.
   - Wähle **Microsoft Graph** > **Delegierte Berechtigungen**.
   - Stelle sicher, dass `User.Read` aktiv ist.
   - Suche nach `Directory.Read.All` oder `GroupMember.Read.All` und füge die Berechtigung hinzu (erforderlich, um Gruppenmitgliedschaften des angemeldeten Admins zu prüfen).
   - Klicke auf **Administratoreinwilligung für [Tenant-Name] erteilen** und bestätige dies.

6. **Admin-Gruppe einrichten**:
   - Navigiere im Entra Center zu **Gruppen** > **Alle Gruppen** und wähle die Sicherheitsgruppe aus (z. B. `Feuerwehr-Admins`), die Zugriff auf das Admin-Dashboard erhalten soll.
   - Kopiere die **Objekt-ID** der Gruppe und trage sie als `ENTRA_ADMIN_GROUP_ID` ein.

---

## Ausführliche Dokumentation

Im Ordner [docs/](docs/) findest du detaillierte Projektdokumente:
- [Walkthrough der Verifikation und Testaufzeichnung](docs/walkthrough.md)
- [Technischer Implementierungsplan](docs/implementation_plan.md)
- [Taskliste und Entwicklungsstatus](docs/task.md)
