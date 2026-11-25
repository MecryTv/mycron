---
id: W-0056
title: "Discord: Status des Bots allgemein statt aufgabenbezogen"
type: bug
priority: P2
status: erledigt
effort: S
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed: 2026-11-25
milestone:
branch: fix/w-0056-discord-status-des-bots
tags: [discord]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord: Status des Bots allgemein statt aufgabenbezogen

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->
Der Status des Discord-Bots in der Mitgliederliste nennt ein Projekt und eine Aufgabe („arbeitet an W-0050 (mycron)“), obwohl er für alle im Server sichtbar ist und beim gemeinsamen Bot für viele Nutzer gilt.

## Beschreibung
Wunsch des Nutzers am 2026-11-25: Die Statusmeldungen des works-Discord-Bots sollen allgemein sein und nicht für einzelne Aufgaben. Heute setzt statusLine() in discord-bot.mjs zum Beispiel „arbeitet an W-0050 (mycron)“; auch „mycron wartet auf deine Freigabe“ und „mycron wartet auf dich“ nennen je ein Projekt. Gewünscht ist ein allgemeiner Status ohne Aufgaben-ID, etwa wie die Zusammenfassung im Panel („2 warten auf dich · 1 arbeitet“). Ergänzung des Nutzers am 2026-11-25: Weil der Bot (vor allem der gemeinsame) mehr Nutzer bekommen kann, noch allgemeiner fassen, ohne Projektnamen und ohne Aufgaben, etwa wie viele Leute works gerade nutzen. Fällt W-0050 vorher fertig an, dort nicht mit hineinmischen; eigener Fix nach W-0050.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Eigenen Bot mit Gateway (Node 22) laufen lassen, eine Aufgabe in Arbeit, Claude arbeitet.
2. In Discord die Mitgliederliste ansehen: Status „arbeitet an W-… (Projekt)“. Bei einer Freigabe „Projekt wartet auf deine Freigabe“. Immer.
3. Gemeinsamer Bot: Status immer fest „/works help“, egal wie viele ihn nutzen.

## Erwartetes Verhalten
Eigener Bot: nur Zahlen über alle Projekte wie die Zusammenfassung im Panel („2 warten auf dich · 1 arbeitet“, sonst „3 Projekte im Blick“). Gemeinsamer Bot: „n Leute nutzen works“ mit der Zahl aus dem Dienst. Nie ein Projektname, nie eine Aufgaben-ID.

## Tatsächliches Verhalten
statusLine() nahm das jüngste wartende oder arbeitende Projekt und schrieb seinen Namen und die aktive Aufgabe in den Status.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
Der Status war seit W-0044 als „das Wichtigste über alle Projekte“ gebaut: statusLine() in discord-bot.mjs suchte je Art (Freigabe, fertig, arbeitet) das jüngste Projekt und setzte dessen Namen, beim Arbeiten auch `snap.active.id`. Das passt für einen Nutzer allein, aber nicht für eine Mitgliederliste, die alle im Server sehen. Der gemeinsame Bot bekam in server.mjs fest „/works help“ mit, ohne etwas über die Nutzung zu sagen.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
- Eigener Bot: `countParts()` zählt „wartet auf dich“ (Freigabe oder fertig und wartet) und „arbeitet“ (ohne Freigabe) über alle Projekte. Die Zusammenfassung im Panel und statusLine() nutzen dieselbe Funktion, damit Status und Panel nie auseinanderlaufen. Ohne Wartende und Arbeitende bleibt „N Projekte im Blick“. Drosselung wie bisher (20 s).
- Gemeinsamer Bot: `statusText()` in services/works-bot/server.mjs zählt verschiedene `user_id` der Kopplungen ohne `broken`. Ab zwei Leuten „n people use works“ bzw. mit `WORKS_BOT_LANG=de` „n Leute nutzen works“, darunter „/works help“. Der Text geht beim Identify mit; `updateStatus()` prüft jede Minute und setzt höchstens alle 5 Minuten neu (Discord drosselt Presence-Updates).
- Doku: references/integrations.md und references/de/integrations.md (Status des Bots), services/works-bot/README.md (Einstellung `WORKS_BOT_LANG`, Status, Hinweis auf den Neustart).
- Der neue Status des gemeinsamen Bots erscheint erst nach einem Neustart des Dienstes auf dem VPS (`git pull && docker compose up -d --build`). Deployt wurde nichts.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Der Status des Bots nennt keine Aufgaben-ID mehr
- [x] Der Status nennt keine Projektnamen und passt für viele Nutzer, etwa „x Leute nutzen works“ (Zahl beim gemeinsamen Bot aus dem Dienst)

## Betroffene Dateien
- plugins/works/skills/works/scripts/discord-bot.mjs (countParts, summaryLine, statusLine)
- plugins/works/skills/works/scripts/selftest.mjs (Schritt W-0044: Status ohne Projekt und Aufgabe, deutsch und englisch)
- services/works-bot/server.mjs (statusText, updateStatus, WORKS_BOT_LANG)
- services/works-bot/test.mjs (Status mit Leuten, Geräten, kaputten Kopplungen, Neustart auf Deutsch)
- plugins/works/skills/works/references/integrations.md, references/de/integrations.md, services/works-bot/README.md

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Abgeschlossen am 2026-11-25. Keine offene Übergabe.

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Priorität: P3 → P2; incomplete: true → false
- 2026-11-25: Nutzer: P2; Status noch allgemeiner, ohne Projekte, etwa wie viele Leute works nutzen
- 2026-11-25: Parallel gestartet im Worktree W-0056-discord-status-des-bots (Status: backlog → in-arbeit)
- 2026-11-25: Eigener Bot: statusLine zählt wie die Zusammenfassung im Panel (gemeinsame Funktion countParts), etwa „2 warten auf dich · 1 arbeitet“, sonst „N Projekte im Blick“. Arbeitet zählt jetzt wie im Panel auch ohne aktive Aufgabe.
- 2026-11-25: Entscheidung gemeinsamer Bot: n = verschiedene user_id mit funktionierender Kopplung (kaputte zählen nicht, mehrere Geräte einmal). Ab 2 „n people use works“, darunter bleibt „/works help“: „1 Leute“ wäre falsch und „1 Person nutzt works“ sagt anderen nichts, der Hinweis auf die Hilfe nützt mehr. Löst auf Wunsch des Nutzers den Teil „gemeinsamer Bot fest /works help“ aus W-0044 (E3) ab.
- 2026-11-25: Entscheidung Sprache: Der Status des gemeinsamen Bots gilt für alle Server gleich, daher eine Sprache über WORKS_BOT_LANG (de oder en), Standard en. Für „n Leute nutzen works“ WORKS_BOT_LANG=de in die .env des Dienstes. Neu gesetzt höchstens alle 5 Minuten, geprüft jede Minute; sichtbar erst nach einem Neustart des Dienstes auf dem VPS.
- 2026-11-25: Akzeptanzkriterien: "Der Status des Bots nennt keine Aufgaben-ID mehr" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Der Status nennt keine Projektnamen und passt für viele Nutzer, etwa „x Leute nutzen works“ (Zahl beim gemeinsamen Bot aus dem Dienst)" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-25: Tests: Schnelltest Discord 17/17, voller Selbsttest ohne WebSocket 53/53, mit Browser 60/60, services/works-bot/test.mjs bestanden (zweimal). Vorher rot: Diensttest wartete vergeblich auf „2 people use works“.
- 2026-11-25: Übergabe aktualisiert
- 2026-11-25: Status: in-arbeit → review (Grund: Agent fertig)
- 2026-11-25: Parallele Arbeit beendet
- 2026-11-25: Abgeschlossen (Status: review → erledigt), DoD bestätigt
