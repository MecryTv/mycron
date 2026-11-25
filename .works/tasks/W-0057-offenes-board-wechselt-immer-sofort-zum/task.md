---
id: W-0057
title: Offenes Board wechselt immer sofort zum Hub, wenn ein weiteres startet
type: feature
priority: P2
status: in-arbeit
effort: S
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch: feature/w-0057-offenes-board-wechselt-immer
tags: [board, hub]
blocked_by: []
blocks: []
related: [W-0049, W-0054]
source: manuell
incomplete: false
---

# Offenes Board wechselt immer sofort zum Hub, wenn ein weiteres startet

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-25 (nach W-0049): Ist ein Board offen und startet noch eines, soll der offene Board-Tab direkt und automatisch zum Hub werden, ohne Ausnahmen. Heute gibt es Ausnahmen: Ein Tab, der aus dem Hub geöffnet wurde (?from=hub), bleibt auf dem Board; wird ein zweiter Start in den Hub umgeleitet (W-0049), wechselt der offene Tab nur mit --open; und der Wechsel beim Start eines zweiten Boards kommt erst mit der nächsten Abfrage von /boards (bis zu 5 s). Zusammenhang: W-0054 (Tab eines geschlossenen Boards schließt sich), damit dabei keine zwei Hub-Tabs entstehen.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Startet ein weiteres Board oder wird ein Start in den Hub umgeleitet, wechselt jeder offene works-Board-Tab sofort zum Hub, auch ohne --open und auch Tabs mit ?from=hub

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [ ] 

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Beziehung: related W-0049
- 2026-11-25: Beziehung: related W-0054
- 2026-11-25: Priorität: P3 → P2; incomplete: true → false
- 2026-11-25: Parallel gestartet im Worktree W-0057-offenes-board-wechselt (Status: backlog → in-arbeit)
- 2026-11-25: Test zuerst: neuer Selbsttest-Schritt (Tab als /events-Stream) war vor der Umsetzung rot: Tab A bekam beim Start von B mit --no-hub kein event: hub.
- 2026-11-25: Entscheidung: Der neue Server meldet sich nach listen bei allen anderen laufenden Boards (sendTabsToHub in hub.mjs: /boards für das Token, dann POST /api/hub op show, 1,5 s Timeout, Fehler still). Kein Signal, wenn er mit takeover startet (--restart, neue Version, Übergabe), damit ein Neustart nichts umschaltet. --restart ohne laufendes Board zählt als neuer Start.
- 2026-11-25: Entscheidung: Die 5-s-Abfrage in board.js vergleicht Kennungen statt Anzahl. Ausgangsstand ist die erste Abfrage, so bleibt der frisch geöffnete Tab des neuen Boards stehen; die ?from=hub-Ausnahme entfällt. Ein Board, das bei einer Abfrage fehlte und binnen 2 min wieder da ist, gilt als Neustart (2 min wegen gedrosselter Timer in Hintergrund-Tabs). Der Parameter ?from=hub bleibt in den Hub-Links stehen, wirkt aber nicht mehr.
- 2026-11-25: Entscheidung: Umgeleiteter Start (W-0049) schickt die Tabs aller laufenden Boards zum Hub, auch ohne --open; showHub entfällt. Ohne offenen Tab öffnet nur --open den Hub.
