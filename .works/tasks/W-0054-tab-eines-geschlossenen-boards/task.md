---
id: W-0054
title: Tab eines geschlossenen Boards schließt sich, statt zum zweiten Hub zu werden
type: feature
priority: P3
status: backlog
effort:
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed:
milestone:
branch:
tags: [board, hub]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: true
---

# Tab eines geschlossenen Boards schließt sich, statt zum zweiten Hub zu werden

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-24 (nach W-0049): Schließt sich ein Board (gestoppt, beendet) und ist es noch als Tab offen, soll sich dieser Tab schließen, damit am Ende nicht zwei Hub-Tabs offen sind. Heute wechselt der Tab eines beendeten Boards zum Hub oder zum verbliebenen Board (W-0032, W-0029), während oft schon ein Hub-Tab offen ist. Hinweis für die Umsetzung: Browser erlauben window.close() nur für Tabs, die per Skript geöffnet wurden; für von Hand geöffnete Tabs eine Lösung finden oder mit dem Nutzer klären (etwa: Tab schließt sich, wenn ein anderer works-Tab den Hub schon zeigt, sonst wird er selbst zum Hub).

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Wird ein Board beendet, während sein Tab offen ist und schon ein Hub-Tab offen ist, bleibt am Ende nur ein Hub-Tab

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
- 2026-11-24: Aufgabe angelegt
