---
id: W-0012
title: "Board: Konflikt-Radar für Aufgaben mit denselben Dateien"
type: feature
priority: P3
status: backlog
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch:
tags: [ui, board, parallel]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Board: Konflikt-Radar für Aufgaben mit denselben Dateien

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag 2 vom 2026-11-21, vom Nutzer gewünscht. works merkt sich in .works/files.jsonl, welche Aufgabe welche Dateien geändert hat. Das Board soll warnen, wenn zwei offene Aufgaben (in Arbeit, Review, Warteschlange) dieselben Dateien ändern, zum Beispiel "W-0012 und W-0015 ändern beide board.js". Hilft vor allem vor paralleler Arbeit (works parallel plan). Anzeige an der Karte und in der Live-Ansicht unter "Wartet auf dich" oder als Hinweis. Erst Entwurf zeigen, Wahl abwarten.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Zwei offene Aufgaben mit gemeinsamen Dateien werden im Board als möglicher Konflikt angezeigt
- [ ] Der Hinweis nennt die Aufgaben und die gemeinsamen Dateien
- [ ] Erledigte und verworfene Aufgaben zählen nicht
- [ ] works parallel plan nutzt dieselbe Erkennung

## Umsetzungsplan
- [ ] Entwurf zeigen, Wahl abwarten
- [ ] Erkennung aus files.jsonl in board.mjs
- [ ] Anzeige im Board
- [ ] Selbsttest mit Browser, Linux, Doku

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
<!-- Wird am Ende jeder Arbeitsphase mit `works handoff` überschrieben. -->

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: decisions.md angelegt
- 2026-11-21: Brainstorming angehängt
- 2026-11-21: Entwurf A „Board-Erweiterungen W-0011 bis W-0014“ angehängt
- 2026-11-21: Entwurf A „Board-Erweiterungen W-0011 bis W-0014“ gewählt. Grund: Nutzer: A (Diff klappt unter dem Eintrag auf), Rest passt
