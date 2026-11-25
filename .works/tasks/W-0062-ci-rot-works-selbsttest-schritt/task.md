---
id: W-0062
title: "CI rot: works Selbsttest, Schritt Selbsttest"
type: bug
priority: P2
status: in-arbeit
effort:
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch: fix/w-0062-ci-rot-works-selbsttest
tags: []
blocked_by: []
blocks: []
related: [W-0053]
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit efa3113 in MecryTv/mycron.

Rote Jobs:
- Node 18 auf windows-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45678612590/job/139432804251

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. In .works/server.json steht die PID eines anderen, laufenden Prozesses (Windows vergibt PIDs nach dem Ende eines Boards schnell neu).
2. works board --stop beendet diesen fremden Prozess; ein Start meldet unter Umständen den Port aus der alten Datei. Im Selbsttest immer, mit einem schlafenden Node-Prozess als Fremdem.

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Board merkt sich seinen Port: Neustart ohne --port, belegter Port weicht aus: Belegter letzter Port nicht ausgewichen: Live-Board läuft: http://127.0.0.1:48259/ | Blocker: {"address":"127.0.0.1","family":"IPv4","port":48259} | server.json: { "pid": 7544, "port": 48260, "host": "127.0.0.1", "version": "7157e6ba9e48", "cli": "D:\\a\\mycron\\mycron\\plugins\\works\\skills\\works\\scripts\\works.mjs", "started": "2026-11-25T18:48:11.384Z" } | server.log: Beobachte C:\Users\RUNNER~1\AppData\Local\Temp\works-selftest-XX8kKF\projekt\.works / Beenden mit Strg+C. / Live-Board läuft: http://127.0.0.1:48259/ / Beobachte C:\Users\RUNNER~1\AppData\Local\Temp\works-selftest-XX8kKF\projekt\.works / Beenden mit Strg+C. / Live-Board läuft: http://127.0.0.1:48260/ / Beobachte C:\Users\RUNNER~1\AppData\Local\Temp\works-selftest-XX8kKF\projekt\.works / Beenden mit Strg+C.
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
readServer prüfte nur, ob die PID lebt, nicht, ob dahinter ein works-Board steckt. Die Diagnose aus W-0053 zeigte in der CI: Der neue Server lief richtig auf dem Ausweichport 48260, das CLI meldete aber 48259 aus einer veralteten server.json. Dieselbe Prüfung entschied, welche PID works board --stop, der Austausch einer alten Version und ship beenden.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
liveServer() in server-control.mjs fragt /tabs auf dem Port der server.json: Antwortet dort kein works-Board (Verbindung abgelehnt oder fremde Antwort), fällt die Datei weg und kein Prozess wird angefasst; nur bei einer Zeitüberschreitung gilt der Server als unserer. Genutzt von works board, works shot, refreshServers (Sitzungsstart) und ship. waitForServer nimmt nur die server.json des gerade gestarteten Prozesses. Regressionstest „Board: fremde PID in server.json wird nicht beendet (W-0062)“.

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] 

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Beziehung: related W-0053
