---
id: W-0054
title: Tab eines geschlossenen Boards schließt sich, statt zum zweiten Hub zu werden
type: feature
priority: P3
status: backlog
effort:
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed:
milestone:
branch:
tags: [board, hub]
blocked_by: []
blocks: []
related: [W-0057]
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
- [ ] Erkennen: Endet das Board eines Tabs, fragt der Tab die anderen laufenden Boards (/boards aus dem letzten Stand), ob dort schon ein works-Tab offen ist (/tabs, nur Zahl; dafür CORS nur für http://127.0.0.1:* und localhost)
- [ ] Ist einer offen: window.close() versuchen; klappt das nicht (von Hand geöffnete Tabs darf eine Seite nicht schließen), statt eines zweiten Hubs eine schlichte Seite „Board beendet“ zeigen: Hinweis, dass der Hub schon in einem anderen Tab offen ist, Knopf „Hier den Hub öffnen“
- [ ] Ist keiner offen: wie bisher zum Hub oder zum verbliebenen Board
- [ ] Selbsttest (Browser): zwei Tabs, Board B endet, am Ende nur ein Hub-Tab; Doku board.md beide Sprachen

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->
- [ ] Vorschlag für den Fall, dass der Browser das Schließen verbietet: statt eines zweiten Hubs eine schlichte Seite „Board beendet“ mit Hinweis und Knopf „Hier den Hub öffnen“. Passt das so, oder soll ich vorher Entwürfe für diese Seite zeigen?

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Priorität: P3 → P3
- 2026-11-25: Beziehung: W-0057 related
- 2026-11-25: Vorgehen ausgearbeitet (Umsetzungsplan) und Frage zum Fall „Browser verbietet das Schließen“ eingetragen; W-0057 ist ausgeliefert, damit entstehen zwei Hub-Tabs nur noch, wenn ein Board-Tab offen bleibt, dessen Board endet.
