---
id: W-0057
title: Offenes Board wechselt immer sofort zum Hub, wenn ein weiteres startet
type: feature
priority: P2
status: backlog
effort: S
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch:
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
