---
id: W-0038
title: "Board: Einstellungen für den Discord-Bot"
type: feature
priority: P2
status: backlog
effort: M
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch:
tags: [ui, discord, board]
blocked_by: [W-0036]
blocks: []
related: []
source: manuell
incomplete: false
---

# Board: Einstellungen für den Discord-Bot

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Teil der Discord-Anbindung (siehe W-0036), Wunsch des Nutzers vom 2026-11-23 (P2): Einstellungen nach Entwurf D, aber komplett verbessert. Verbindungsstatus, Einrichtung in Schritten (Bot anlegen, Token, Server einladen, Kanal wählen), Erwähnung, Ereignisse, Datenschutz, Befehle. Token nie im Board sichtbar. Gestaltung über Entwürfe, Wahl abwarten.

Gewählt: Entwurf J2 (Dialog mit Reitern und Vorschau), Einrichtung nach R aus W-0040 (gemeinsamer oder eigener Bot). Wunsch des Nutzers am 2026-11-23 (P2): Im Board selbst den Kanal auswählen können, auf dem Discord-Server, auf den der Bot eingeladen ist. Gewählt: Entwurf K (Server und Kanäle live vom Bot, gesperrte ausgegraut, „Hierher verschieben“ legt das Dashboard aus W-0044 im neuen Kanal an und räumt den alten auf).

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
<!-- Prüfbare Aussagen. Jede Zeile muss sich mit ja oder nein beantworten lassen. -->
- [ ] Dialog Discord-Bot im Board nach J2 mit den Reitern Verbindung, Projekte, Ereignisse, Befehle, Datenschutz und Vorschau
- [ ] Einrichtung nach R: gemeinsamer Bot mit Code oder eigener Bot mit Token, Token und Schlüssel nie sichtbar
- [ ] Kanalwahl nach K: Server und Textkanäle live vom Bot, Kanäle ohne Schreibrecht ausgegraut, Verschieben des Dashboards
- [ ] Änderungen wirken ohne Neustart des Bots
- [ ] Selbsttest mit Browser deckt Dialog und Kanalwahl ab

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] Entwürfe lesen: design/J2-j-verbessert.html (Dialog, Reiter, Vorschau) und design/K-kanal-im-board-waehlen.html (Kanalwahl); Aussehen und Texte daraus übernehmen, Stil wie die übrigen Dialoge unter Werkzeuge in board.js/board.css
- [ ] Test zuerst: Selbsttest-Schritte (API ohne Browser und ein Browser-Schritt für Dialog und Kanalwahl) gegen discord-fake.mjs, vorher rot sehen
- [ ] Board-API (serve.mjs/api.mjs, nur Besitzer-Level edit): Stand lesen (Modus, Bot läuft, Server/Kanal, Ereignisse, Ruhezeit, Datenschutz, Verzögerungen, cleanup.hours, Projekte an/aus und eigener Kanal), Einstellungen schreiben über applySetting aus discord.mjs, Projekt an/aus, Token setzen (nur schreiben, nie zurückgeben, Prüfung wie works discord token), Code koppeln (wie works discord link), trennen
- [ ] Kanalwahl K: Server und Textkanäle live; eigener Bot über REST mit dem Token aus secret.json (Kanäle nach Kategorie, Schreibrecht des Bots aus Rollen und Overwrites berechnen, ohne Schreibrecht ausgegraut mit Grund); gemeinsamer Bot: neue Dienst-Routen GET /v1/guild/channels (Kanäle des gekoppelten Servers mit Schreibrecht) und POST /v1/link/channel {channel_id} (Kopplung auf einen anderen Kanal desselben Servers umziehen, nur wenn der Bot dort schreiben darf) in services/works-bot/server.mjs mit Test in services/works-bot/test.mjs
- [ ] „Hierher verschieben“: channel_id in ~/.works/discord/config.json setzen (gemeinsam: erst Dienst umziehen); der laufende Bot legt das Dashboard im neuen Kanal an und löscht das alte selbst (dashboards() in discord-bot.mjs räumt Kanäle ohne Projekte schon auf), kein Neustart
- [ ] Dialog J2 im Board unter Werkzeuge: Reiter Verbindung (Einrichtung nach R: gemeinsamer Bot mit Code oder eigener Bot mit Token, Status, Kanalwahl K), Projekte, Ereignisse (on/at je Ereignis, Ruhezeit, Verzögerungen, Frist cleanup.hours), Befehle (Übersicht der /works-Befehle aus discord-ui.mjs), Datenschutz, Vorschau (renderEvent/renderDashboard als Discord-ähnliche Vorschau)
- [ ] Doku: references/board.md und integrations.md (Abschnitt Discord-Bot), cli.md falls neue Befehle
- [ ] Selbsttest grün: works selftest --only Discord, die Browser-Schritte für das Board, services/works-bot/test.mjs

Hinweise für die Umsetzung:
- Token, Geräteschlüssel und Codes nie in API-Antworten, Logs, URLs oder im DOM; Eingabefelder für Token als type=password, nach dem Speichern leeren. Nur maskiert (…abcd) anzeigen.
- Texte im Board bleiben in diesem Schritt deutsch; W-0041 (Englisch, Sprache umschaltbar) läuft parallel und übernimmt die neuen Texte nach dem Merge. Keine eigene Übersetzungs-Mechanik bauen.
- Windows: in Heredocs und node -e gehen Backslashes verloren, Regexe und \n mit dem Edit-Werkzeug schreiben. Git Bash wandelt Argumente wie /works in Pfade um (MSYS_NO_PATHCONV=1 oder PowerShell).
- Discord-Änderungen auch ohne globales WebSocket testen: NODE_OPTIONS=--no-experimental-websocket works selftest --only Discord (die CI testet Node 18 und 20).
- Kein Board für das echte Projekt starten, nichts im echten Browser öffnen; Browser-Tests nur über den Selbsttest (headless, WORKS_DRY_OPEN).

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->
- plugins/works/skills/works/scripts/board/board.js, board.css: Dialog J2 und Kanalwahl K
- plugins/works/skills/works/scripts/serve.mjs, api.mjs: Discord-Routen für das Board
- plugins/works/skills/works/scripts/discord.mjs: gemeinsame Funktionen für Stand, Token, Koppeln (aus works.mjs cmdDiscord herausziehen, statt sie doppelt zu schreiben)
- plugins/works/skills/works/scripts/discord-fake.mjs: Rollen, Mitglieder, Overwrites für die Rechteberechnung
- services/works-bot/server.mjs, test.mjs, README.md: Kanäle des Servers, Kopplung umziehen
- plugins/works/skills/works/scripts/selftest.mjs: Schritte für Dialog und Kanalwahl

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: Entwurf I „Seitenleiste Discord-Bot“ angehängt
- 2026-11-23: Entwurf J „Dialog mit Vorschau“ angehängt
- 2026-11-23: Entwurf K „Einrichtung in Schritten“ angehängt
- 2026-11-23: decisions.md angelegt
- 2026-11-23: Entscheidung E1 dokumentiert: Einstellungen nach Entwurf J
- 2026-11-23: Entwurf J2 „J verbessert“ angehängt
- 2026-11-23: Entwurf J2 „J verbessert“ gewählt. Grund: Wahl des Nutzers: J verbessert
- 2026-11-23: Beziehung: blocked-by W-0040
- 2026-11-23: Entwurf K „Kanal im Board wählen“ angehängt
- 2026-11-23: Entwurf J2 „J verbessert“ gewählt. Grund: Wahl des Nutzers (J verbessert), dazu K für die Kanalwahl
- 2026-11-23: Beziehung entfernt: blocked-by W-0040
