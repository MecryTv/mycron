---
id: W-0059
title: "Live: Hintergrundbefehle und ihr Ende im Board anzeigen"
type: feature
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch: feature/w-0059-live-hintergrundbefehle-und
tags: [board, live]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Live: Hintergrundbefehle und ihr Ende im Board anzeigen

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-25: Läuft bei Claude etwas im Hintergrund (Bash mit run_in_background, etwa ein Selbsttest), soll das im Board unter Live zu sehen sein. Heute nicht: activity.json kennt nur current, recent, busy und lanes; der PostToolUse-Hook sieht den Aufruf sofort als beendet, weil das Werkzeug gleich mit „Command running in background with ID: …“ zurückkommt. Hinweise für die Umsetzung: Die Rückgabe nennt ID und Ausgabedatei (…\tasks\<id>.output); an deren Ende steht „[exited with code N]“, sobald der Befehl fertig ist. Daraus lassen sich laufend, fertig und Exit-Code ablesen, ohne den Befehl selbst anzufassen. Hintergrund-Agenten zeigt die Kopfleiste schon als Anzahl.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [ ] Ein Hintergrundbefehl erscheint unter Live mit Beschreibung und Laufzeit, solange er läuft, und danach als fertig mit Ergebnis (Exit-Code)

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
- 2026-11-25: Priorität: P3 → P2; incomplete: true → false
- 2026-11-25: Parallel gestartet im Worktree W-0059-live-hintergrundbefehle (Status: backlog → in-arbeit)
