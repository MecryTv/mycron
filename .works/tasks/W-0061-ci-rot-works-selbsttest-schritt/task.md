---
id: W-0061
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
branch: fix/w-0061-ci-rot-works-selbsttest
tags: []
blocked_by: []
blocks: []
related: []
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit 79d5607 in MecryTv/mycron.

Rote Jobs:
- Node 18 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45655753022/job/139351842969

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Im Discord-Ordner liegt eine leere stop.req (halb geschrieben oder übrig).
2. works discord start: Der neue Bot holt sich die Sperre, liest stop.req als „alle sollen gehen“ und beendet sich sofort.
3. Nach 15 s: „Bot startet nicht. … Bot beendet“. Im Selbsttest immer; in der CI selten (macOS, Node 18).

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Branch-Wechsel, ship, Bahnen, Sperrdatei, Versionswechsel, Neustart ohne Verluste: works discord start → Exit 1: Fehler: Bot startet nicht. 2026-11-25T16:38:21.475Z Bot beendet |
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
stopRequested() in discord-bot.mjs wertete eine leere stop.req als Bitte an jeden Bot. requestStop schrieb die Datei nicht in einem Zug, ein Leser konnte sie leer sehen. Dazu wartete works discord start fest 15 s und zeigte nur die letzte Log-Zeile, ohne zu merken, ob der gestartete Prozess noch lebt.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
stopRequested zählt nur eine stop.req mit der eigenen PID; requestStop schreibt über eine Zwischendatei und Umbenennen. works discord start wartet, solange der gestartete Prozess lebt (höchstens 60 s), meldet einen beendeten Bot sofort und zeigt die letzten vier Log-Zeilen. Regressionstest „Discord: Start trotz leerer stop.req (W-0061)“.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ]

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Stand: 2026-11-25 18:17

Fix: stopRequested nur mit eigener PID, requestStop in einem Zug, works discord start wartet solange der Prozess lebt und zeigt vier Log-Zeilen. Tests: mit Browser 62/62, ohne WebSocket 55/55, works-bot grün.

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-25: Übergabe aktualisiert
