# Konzept: Gemeinsamer Discord-Bot works (W-0040)

Stand 2026-11-23. Ziel: Niemand muss einen eigenen Bot anlegen. Du stellst einen Bot für alle bereit, er läuft als Docker-Container auf deinem VPS.

## Kurz

- Das Bot-Token liegt nur auf deinem VPS. Ins Plugin kann es nicht: Jeder könnte es auslesen und den Bot übernehmen, und Discord sperrt öffentlich gewordene Tokens.
- Nutzer laden deinen Bot auf ihren Server ein und koppeln works mit einem einmaligen Code. Danach hat ihr works einen eigenen Schlüssel für genau ihren Kanal.
- Der lokale Bot-Prozess aus W-0036 bleibt fast gleich: Er leitet die Ereignisse weiter ab, baut die Nachrichten (F2) und hält den Statuspost. Er schickt aber nicht mehr direkt an Discord, sondern an deinen Dienst. Der prüft und leitet weiter.
- Der Modus mit eigenem Bot (W-0036) bleibt als Option für alle, die nichts über einen fremden Dienst schicken wollen.

## Ablauf

1. **Einladen:** `works discord` (oder der Dialog im Board) zeigt den Einladungslink deines Bots. Rechte wie bisher: Kanal sehen, senden, Links einbetten, Verlauf lesen, anheften, Slash-Befehle.
2. **Koppeln:** Zwei Varianten, siehe Entwürfe P und Q.
   - P, Code aus Discord: Im gewünschten Kanal `/works verbinden`. Der Bot antwortet nur für dich sichtbar mit einem Code (8 Zeichen, 10 Minuten gültig). Den gibst du in works ein: `works discord link 7Q4K-2M9X` oder im Board.
   - Q, Code aus works: works zeigt den Code. In Discord gibst du `/works verbinden 7Q4K-2M9X` ein, der Bot bestätigt im Kanal.
3. **Schlüssel:** Der Dienst tauscht den Code gegen einen Geräteschlüssel (256 Bit, zufällig). works speichert ihn wie das Token heute in `~/.works/discord/secret.json`, Datei nur für den Nutzer lesbar. Der Dienst speichert nur einen Hash davon.
4. **Betrieb:** Der lokale Bot schickt Nachrichten über HTTPS an den Dienst: neu, bearbeiten, anheften. Der Dienst prüft Schlüssel, Kanal und Grenzen und leitet an Discord weiter.
5. **Befehle und Knöpfe (W-0037):** Der Dienst empfängt sie über das Gateway und legt sie für das gekoppelte Gerät ab. Der lokale Bot holt sie per Long-Poll ab (alle paar Sekunden oder offene Anfrage), führt sie aus und antwortet. Discord gibt für die erste Antwort 3 Sekunden; der Dienst antwortet sofort mit „wird ausgeführt“ und bearbeitet die Antwort, sobald works fertig ist.
6. **Trennen:** `works discord unlink`, im Board „Trennen“ oder in Discord `/works trennen`. Der Schlüssel ist sofort ungültig.

Ein Rechner kann mehrere Projekte in denselben Kanal schicken, wie heute. Mehrere Rechner koppeln je einen eigenen Schlüssel.

## Sicherheit

| Thema | Lösung |
|---|---|
| Token | Nur auf dem VPS, als Docker-Secret oder Umgebungsdatei mit Rechten 600. Nie im Repo, nie im Image. |
| Wer darf koppeln | Nur wer im Discord-Server „Server verwalten“ hat (`/works verbinden` ist dafür gesperrt). |
| Code | Einmalig, 10 Minuten gültig, 5 Fehlversuche je IP und Stunde. |
| Schlüssel | 256 Bit, auf dem Dienst nur als SHA-256-Hash. Jederzeit widerrufbar. |
| Reichweite eines Schlüssels | Nur die gekoppelten Kanäle dieses Servers. Bearbeiten und Anheften nur von Nachrichten, die mit diesem Schlüssel angelegt wurden. |
| Erwähnungen | Der Dienst erzwingt `allowed_mentions` auf den gekoppelten Discord-Nutzer, nie @everyone. |
| Missbrauch | Grenze je Schlüssel (etwa 30 Nachrichten pro Minute, Statuspost-Bearbeitungen gebündelt), Prüfung der Discord-Grenzen vor dem Senden. Schlimmster Fall: Jemand mit einem Schlüssel spammt seinen eigenen Kanal. |
| Transport | HTTPS über deinen vorhandenen Reverse-Proxy (Caddy, Traefik oder nginx) mit Let's Encrypt. |
| Was über den Dienst läuft | Der Inhalt der Nachrichten: Projektname, Aufgaben-IDs, Titel, Status, Kosten, je nach Datenschutz-Schaltern. Die Schalter gelten weiter lokal, bevor etwas den Rechner verlässt. |
| Was der Dienst speichert | Server-ID, Kanal-ID, Discord-Nutzer-ID für Erwähnungen, Schlüssel-Hash, Zeit der letzten Nutzung, Zuordnung Nachrichten-ID zu Schlüssel (30 Tage). Keine Nachrichteninhalte, Logs ohne Inhalte. |

## Kosten und Grenzen

- **VPS:** Läuft schon. Der Dienst braucht etwa 60 bis 100 MB RAM und kaum CPU. Kein zusätzlicher Speicher außer einer kleinen Datei für die Kopplungen.
- **Discord:** Kostenlos. Grenzen: 50 Anfragen pro Sekunde für den ganzen Bot, 5 Nachrichten je 5 Sekunden je Kanal. Für einige hundert Nutzer reicht das, weil der Statuspost gebündelt wird.
- **Ab 100 Servern** verlangt Discord eine Verifizierung des Bots (mit Ausweis des Entwicklers). Bis dahin geht alles ohne.
- **Domain:** Eine Subdomain auf deinem VPS, etwa `works.<deine-domain>`, mit Zertifikat über den Reverse-Proxy.
- **Ausfall des Dienstes:** works puffert wie heute in der outbox und schickt nach. Nichts geht verloren, nichts hängt.

## Aufbau des Dienstes

- Ordner `services/works-bot` im Repo mycron: Node 22, ohne Abhängigkeiten wie works, Dockerfile, `compose.yaml`, Anleitung.
- Teile: HTTP-API (`/v1/link`, `/v1/messages`, `/v1/inbox`, `/health`), Gateway-Verbindung (Online, Slash-Befehle, Knöpfe), REST zu Discord mit den Grenzen aus W-0036 (Code wird geteilt).
- Speicher: eine JSON-Datei mit atomarem Schreiben im Volume. Bei vielen Nutzern später SQLite.
- Tests wie bei W-0036 gegen das nachgebaute Discord, dazu ein Test, der den Dienst lokal startet und works dagegen koppelt. Kein echter VPS nötig.

## Was sich in works ändert

- `works discord`: Auswahl „Gemeinsamer Bot (empfohlen)“ oder „Eigener Bot“. Neu: `works discord link <Code>`, `works discord unlink`.
- Der lokale Bot bekommt eine zweite Verbindung (zum Dienst statt zu Discord). Ereignisse, Nachrichten, Statuspost und Tests aus W-0036 bleiben.
- W-0038 (Einstellungen im Board, J2): Der Reiter Verbindung zeigt die Wahl und die Kopplung statt der Token-Schritte.
- Adresse des Dienstes ist im Plugin hinterlegt und überschreibbar (für Tests und falls du umziehst).

## Offen, bitte entscheiden

1. Kopplung: P (Code aus Discord) oder Q (Code aus works)?
2. Einrichtung im Board: Entwurf R (Auswahl Gemeinsam oder Eigen) so?
3. Eigener Bot bleibt als Option? Empfehlung: ja.
4. Domain für den Dienst auf deinem VPS (kann auch später).
