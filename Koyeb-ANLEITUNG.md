# Flex 1 – Koyeb Online-Test

## GitHub
1. Neues Repository, z.B. `flex1-schulklassen-app`, anlegen.
2. Den Inhalt dieses Ordners in das Repository hochladen.
3. `.env` niemals hochladen.

## Koyeb
1. Bei Koyeb anmelden und Web Service aus GitHub erstellen.
2. Repository auswählen.
3. Region **Frankfurt (fra)** wählen.
4. Für den Test **Free** wählen.
5. Exposed Port **3000 / HTTP**.
6. Health Check **GET /health**.
7. Start Command **npm start** (wird normalerweise erkannt).

## Environment Variables
APP_PASSWORD=<eigenes Klassenpasswort>
ADMIN_PASSWORD=<eigenes Adminpasswort>
SESSION_SECRET=<lange zufällige Zeichenfolge>
NODE_ENV=production

Danach deployen. Koyeb erzeugt eine öffentliche HTTPS-Adresse, die auf Android, iPhone/iPad und PC geöffnet werden kann.

## Wichtig
Die kostenlose Koyeb-Instanz besitzt kein persistentes Volume. SQLite und Upload-Dateien können bei Neustart/Redeploy verloren gehen. Für den echten Klassenbetrieb müssen Datenbank und Dateien auf dauerhaften Speicher umgestellt werden.
