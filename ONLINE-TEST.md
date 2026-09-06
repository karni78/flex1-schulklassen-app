# Flex 1 online kostenlos testen

## Empfohlener Test-Host: Render

Die App ist für Render Free vorbereitet. Render stellt Node.js-Webservices kostenlos bereit und vergibt eine öffentliche `onrender.com`-Adresse. Für den Test genügt ein GitHub-Repository mit diesem Projekt und anschließend `New → Web Service` in Render.

### Einstellungen
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/health`
- Plan: Free

`render.yaml` enthält diese Werte bereits.

### Wichtig für diesen kostenlosen Prototyp
Render-Free-Dateisysteme sind nicht dauerhaft. Eine lokale SQLite-Datenbank sowie hochgeladene Bilder/Dokumente können bei Neustart, Redeploy oder Spin-down verloren gehen. Deshalb ist diese Variante **für den Online-Test**, nicht für den späteren echten Klassenbetrieb gedacht.

Für die spätere dauerhafte Version sollte die App auf eine externe Datenbank (z. B. Neon/Supabase) und dauerhaften Objektspeicher umgestellt werden.

### Android / iPhone
Die App ist als PWA vorbereitet. Nach dem Öffnen der Webadresse kann sie auf Android über `Zum Startbildschirm hinzufügen` und auf iPhone/iPad über `Teilen → Zum Home-Bildschirm` wie eine App abgelegt werden.
